import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("Order Creation", () => {
  it("should create order with daily credit applied", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Setup: Create company and subscription
    const companyResult = await caller.company.detectFromEmail({ email: "john@testcompany.com" });
    await caller.subscription.create({ companyId: companyResult.company.id });

    // Create order with one item
    const order = await caller.order.create({
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    expect(order.dailyCreditUsed).toBe(true);
    expect(order.orderNumber).toMatch(/^ORD-/);
  });

  it("should calculate delivery eligibility based on company orders", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Setup company and subscription
    const companyResult = await caller.company.detectFromEmail({ email: "user@deliverytest.com" });
    await caller.subscription.create({ companyId: companyResult.company.id });

    // Create order
    const order = await caller.order.create({
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    // First order should not have free delivery (need 5+ orders)
    expect(order.isFreeDelivery).toBe(false);
  });

  it("should enforce 10:30 AM cutoff for delivery", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Setup
    const companyResult = await caller.company.detectFromEmail({ email: "user@cutofftest.com" });
    await caller.subscription.create({ companyId: companyResult.company.id });

    // Create order
    const order = await caller.order.create({
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    // Check fulfillment type based on current time
    const now = new Date();
    const cutoffTime = new Date(now);
    cutoffTime.setHours(10, 30, 0, 0);

    if (now > cutoffTime) {
      expect(order.fulfillmentType).toBe("pickup");
    } else {
      expect(order.fulfillmentType).toBe("delivery");
    }
  });
});

describe("Order Retrieval", () => {
  it("should retrieve user's orders", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Setup
    const companyResult = await caller.company.detectFromEmail({ email: "user@ordertest.com" });
    await caller.subscription.create({ companyId: companyResult.company.id });

    // Create order
    await caller.order.create({
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    // Retrieve orders
    const orders = await caller.order.getMyOrders();

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]?.status).toBe("pending");
  });

  it("should get colleagues who ordered today", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const colleagues = await caller.order.getColleaguesWhoOrdered();

    // Should return array (may be empty if no colleagues ordered)
    expect(Array.isArray(colleagues)).toBe(true);
  });
});

describe("Order Status Management", () => {
  it("should update order status (admin only)", async () => {
    const adminCtx = createAuthContext({ role: "admin" });
    const adminCaller = appRouter.createCaller(adminCtx);

    // Setup and create order
    const companyResult = await adminCaller.company.detectFromEmail({ email: "admin@statustest.com" });
    await adminCaller.subscription.create({ companyId: companyResult.company.id });
    const order = await adminCaller.order.create({
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    // Update status
    const updated = await adminCaller.order.updateStatus({
      orderId: order.id,
      status: "preparing",
    });

    expect(updated.status).toBe("preparing");
  });
});
