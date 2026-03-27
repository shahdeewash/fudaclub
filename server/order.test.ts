import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { getDb } from "./db";
import { menuItems } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(user?: Partial<AuthenticatedUser>): TrpcContext {
  const defaultUser: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "john@testcompany.com",
    name: "John Doe",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...user,
  };

  return {
    user: defaultUser,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Seed a Square-synced menu item so order tests pass regardless of DB state */
async function seedTestMenuItem(): Promise<number> {
  const drizzle = await getDb();
  const squareCatalogId = `test_item_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const [result] = await drizzle.insert(menuItems).values({
    name: "Test Dish",
    squareCatalogId,
    price: 1500,
    category: "Test",
    isAvailable: true,
  });
  return (result as unknown as { insertId: number }).insertId;
}

/** Seed an active subscription directly via db helper (bypasses Stripe) */
async function seedSubscription(userId: number, companyId: number) {
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db.createSubscription({
    userId,
    companyId,
    status: "active",
    price: 27000,
    planAmount: 27000,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });
}

// Generate a unique suffix for each test run to avoid DB contamination
const RUN_ID = Date.now() % 100000;

describe("Order Creation", () => {
  it("should create order with daily credit applied", { timeout: 15000 }, async () => {
    // Use unique IDs to avoid cross-test contamination
    const userId = 900000 + RUN_ID;
    const menuItemId = await seedTestMenuItem();
    const setupCaller = appRouter.createCaller(createAuthContext({ id: userId }));
    const companyResult = await setupCaller.company.detectFromEmail({ email: `user${userId}@ordertest.com` });
    await seedSubscription(userId, companyResult.company.id);

    const ctx = createAuthContext({ id: userId, companyId: companyResult.company.id });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.order.create({
      items: [{ menuItemId, quantity: 1 }],
    });

    expect(result.order.dailyCreditUsed).toBe(true);
    expect(result.order.orderNumber).toMatch(/^ORD-/);
  });

  it("should calculate delivery eligibility based on company orders", { timeout: 15000 }, async () => {
    const userId = 900001 + RUN_ID;
    const menuItemId = await seedTestMenuItem();
    // Use full timestamp in domain to guarantee uniqueness across runs
    const uniqueDomain = `deliverytest${Date.now()}.com`;
    const setupCaller = appRouter.createCaller(createAuthContext({ id: userId }));
    const companyResult = await setupCaller.company.detectFromEmail({ email: `user${userId}@${uniqueDomain}` });
    await seedSubscription(userId, companyResult.company.id);

    const ctx = createAuthContext({ id: userId, companyId: companyResult.company.id });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.order.create({
      items: [{ menuItemId, quantity: 1 }],
    });

    // First order for this brand-new company should not have free delivery (need 5+ orders)
    expect(result.order.isFreeDelivery).toBe(false);
  });

  it("should enforce 10:30 AM cutoff for delivery", { timeout: 15000 }, async () => {
    const userId = 900002 + RUN_ID;
    const menuItemId = await seedTestMenuItem();
    const setupCaller = appRouter.createCaller(createAuthContext({ id: userId }));
    const companyResult = await setupCaller.company.detectFromEmail({ email: `user${userId}@cutofftest.com` });
    await seedSubscription(userId, companyResult.company.id);

    const ctx = createAuthContext({ id: userId, companyId: companyResult.company.id });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.order.create({
      items: [{ menuItemId, quantity: 1 }],
    });

    // Check fulfillment type based on current Darwin time (UTC+9:30)
    const nowUtc = new Date();
    const darwinOffsetMs = 9.5 * 60 * 60 * 1000;
    const darwinNow = new Date(nowUtc.getTime() + darwinOffsetMs);
    const darwinHour = darwinNow.getUTCHours();
    const darwinMinute = darwinNow.getUTCMinutes();
    const isPastCutoff = darwinHour > 10 || (darwinHour === 10 && darwinMinute >= 30);

    if (isPastCutoff) {
      expect(result.order.fulfillmentType).toBe("pickup");
    } else {
      expect(result.order.fulfillmentType).toBe("delivery");
    }
  });
});

describe("Order Retrieval", () => {
  it("should retrieve user's orders", { timeout: 15000 }, async () => {
    const userId = 900003 + RUN_ID;
    const setupCaller = appRouter.createCaller(createAuthContext({ id: userId }));
    const companyResult = await setupCaller.company.detectFromEmail({ email: `user${userId}@ordertest.com` });
    await seedSubscription(userId, companyResult.company.id);

    const ctx = createAuthContext({ id: userId, companyId: companyResult.company.id });
    const caller = appRouter.createCaller(ctx);

    const menuItemId = await seedTestMenuItem();
    await caller.order.create({
      items: [{ menuItemId, quantity: 1 }],
    });

    const orders = await caller.order.getMyOrders();

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]?.status).toBe("pending");
  });

  it("should get colleagues who ordered today", async () => {
    const ctx = createAuthContext({ id: 900004 + RUN_ID });
    const caller = appRouter.createCaller(ctx);

    const colleagues = await caller.order.getColleaguesWhoOrdered();

    // Should return array (may be empty if no colleagues ordered)
    expect(Array.isArray(colleagues)).toBe(true);
  });
});

describe("Order Status Management", () => {
  it("should update order status (admin only)", { timeout: 15000 }, async () => {
    const userId = 900005 + RUN_ID;
    const setupCaller = appRouter.createCaller(createAuthContext({ id: userId, role: "admin" }));
    const companyResult = await setupCaller.company.detectFromEmail({ email: `admin${userId}@statustest.com` });
    await seedSubscription(userId, companyResult.company.id);

    const adminCtx = createAuthContext({ id: userId, role: "admin", companyId: companyResult.company.id });
    const adminCaller = appRouter.createCaller(adminCtx);

    const menuItemId = await seedTestMenuItem();
    const createResult = await adminCaller.order.create({
      items: [{ menuItemId, quantity: 1 }],
    });

    // updateStatus returns { success: true }
    const updated = await adminCaller.order.updateStatus({
      orderId: createResult.order.id,
      status: "preparing",
    });

    expect(updated.success).toBe(true);
  });
});
