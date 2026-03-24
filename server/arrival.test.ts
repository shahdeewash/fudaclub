/**
 * Tests for:
 * - order.exportOrders (admin CSV export)
 * - order.markArrived (customer arrival)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

// Helper to create a minimal mock context
function makeCtx(role: "admin" | "user" | "kitchen" = "admin") {
  return {
    user: {
      id: 9901 + Math.floor(Math.random() * 100),
      email: `test-${Date.now()}@fuda.test`,
      name: "Test User",
      role,
      openId: `test-open-id-${Date.now()}`,
    },
    req: { headers: { origin: "http://localhost:3000" } } as any,
    res: {} as any,
  };
}

describe("Order Export (Admin CSV)", () => {
  it("should return CSV-compatible rows with correct fields for admin", async () => {
    const ctx = makeCtx("admin");
    const caller = appRouter.createCaller(ctx as any);

    const rows = await caller.stats.exportOrders({ dateFilter: "all" });
    expect(Array.isArray(rows)).toBe(true);

    if (rows.length > 0) {
      const row = rows[0];
      // Required columns per spec
      expect(row).toHaveProperty("order_id");
      expect(row).toHaveProperty("created_at");
      expect(row).toHaveProperty("lane");
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("items_count");
      expect(row).toHaveProperty("subtotal_ex_gst");
      expect(row).toHaveProperty("gst_10pct");
      expect(row).toHaveProperty("total_inc_gst");
      expect(row).toHaveProperty("payment_method");
      expect(row).toHaveProperty("customer_name");
      expect(row).toHaveProperty("customer_email");

      // GST math: total_inc_gst should equal subtotal_ex_gst * 1.10 (rounded to 2dp)
      const subtotal = parseFloat(row.subtotal_ex_gst);
      const gst = parseFloat(row.gst_10pct);
      const total = parseFloat(row.total_inc_gst);
      expect(Math.round(subtotal * 0.10 * 100) / 100).toBeCloseTo(gst, 2);
      expect(Math.round(subtotal * 1.10 * 100) / 100).toBeCloseTo(total, 2);

      // Timezone: created_at should end with ACST
      expect(row.created_at).toMatch(/ACST$/);

      // No sensitive PII (no phone, no street address)
      expect(row).not.toHaveProperty("phone");
      expect(row).not.toHaveProperty("address");
    }
  });

  it("should reject non-admin users", async () => {
    const ctx = makeCtx("user");
    const caller = appRouter.createCaller(ctx as any);
    await expect(caller.stats.exportOrders({ dateFilter: "today" })).rejects.toThrow();
  });
});

describe("Mark Arrived", () => {
  let orderId: number;
  let userId: number;

  beforeAll(async () => {
    // Create a test user and company
    const testEmail = `arrival-test-${Date.now()}@fuda.test`;
    const allCompanies = await db.getAllCompanies();
    let company = allCompanies.find(c => c.name === "Arrival Test Co");
    if (!company) {
      company = await db.createCompany({ name: "Arrival Test Co", domain: "arrivaltest.example.com", subscriptionStatus: "active" });
    }
    const openId = `arrival-open-${Date.now()}`;
    await db.upsertUser({
      email: testEmail,
      name: "Arrival Tester",
      openId,
      role: "user",
      companyId: company.id,
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error("Failed to create test user");
    userId = user.id;

    // Create a confirmed pickup order
    const order = await db.createOrder({
      userId: user.id,
      companyId: company.id,
      orderNumber: `ARR-${Date.now()}`,
      orderDate: new Date(),
      status: "confirmed",
      fulfillmentType: "pickup",
      isFreeDelivery: false,
      dailyCreditUsed: false,
      subtotal: 1500,
      deliveryFee: 0,
      tax: 150,
      total: 1650,
    });
    orderId = order.id;
  });

  it("should mark a confirmed order as arrived", async () => {
    const ctx = {
      user: {
        id: userId,
        email: `arrival-test@fuda.test`,
        name: "Arrival Tester",
        role: "user" as const,
        openId: `arrival-open`,
      },
      req: { headers: {} } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx as any);
    const result = await caller.stats.markArrived({ orderId });
    expect(result.success).toBe(true);
    expect(result.orderNumber).toBeTruthy();
  });

  it("should reject marking arrived for an order that doesn't belong to the user", async () => {
    const ctx = makeCtx("user"); // different random user id
    const caller = appRouter.createCaller(ctx as any);
    await expect(caller.stats.markArrived({ orderId })).rejects.toThrow();
  });
});
