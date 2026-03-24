import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";

// Mock the Stripe module
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/test",
          }),
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_123",
            payment_status: "paid",
            client_reference_id: "1",
            metadata: {
              order_data: JSON.stringify({
                items: [{ menuItemId: 1, quantity: 1, price: 1750 }],
                deliveryFee: 800,
                tax: 255,
                dailyCreditApplied: false,
              }),
            },
          }),
        },
      },
    })),
  };
});

const mockAdminUser: User = {
  id: 1,
  name: "Admin User",
  email: "admin@test.com",
  role: "admin",
  companyId: 1,
  openId: "admin_open_id",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCustomerUser: User = {
  id: 2,
  name: "Customer User",
  email: "customer@company.com",
  role: "user",
  companyId: 1,
  openId: "customer_open_id",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createCaller(user: User | null) {
  return appRouter.createCaller({
    user,
    req: {} as any,
    res: {} as any,
  });
}

describe("Menu Edit/Delete", () => {
  it("should allow admin to update a menu item", async () => {
    const caller = createCaller(mockAdminUser);
    // Get all menu items first
    const items = await caller.menu.getAll();
    if (items.length === 0) {
      console.log("No menu items to test with, skipping");
      return;
    }
    const firstItem = items[0];
    const result = await caller.menu.update({
      menuItemId: firstItem!.id,
      name: firstItem!.name, // Keep same name
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-admin from updating menu item", async () => {
    const caller = createCaller(mockCustomerUser);
    const items = await caller.menu.getAll();
    if (items.length === 0) return;
    const firstItem = items[0];
    await expect(
      caller.menu.update({
        menuItemId: firstItem!.id,
        name: "Hacked Name",
      })
    ).rejects.toThrow();
  });
});

describe("Stripe Checkout Session", () => {
  it("should create a checkout session for paid orders", async () => {
    const caller = createCaller(mockCustomerUser);
    const result = await caller.payment.createCheckoutSession({
      cartItems: [
        { name: "Test Item", price: 1750, quantity: 1 },
      ],
      totalAmount: 2805,
      origin: "https://test.example.com",
      orderData: {
        items: [{ menuItemId: 1, quantity: 1, price: 1750 }],
        deliveryFee: 800,
        tax: 255,
        dailyCreditApplied: false,
      },
    });
    expect(result.url).toBe("https://checkout.stripe.com/test");
    expect(result.sessionId).toBe("cs_test_123");
  });

  it("should require authentication for checkout session", async () => {
    const caller = createCaller(null);
    await expect(
      caller.payment.createCheckoutSession({
        cartItems: [{ name: "Test Item", price: 1750, quantity: 1 }],
        totalAmount: 2805,
        origin: "https://test.example.com",
        orderData: {
          items: [{ menuItemId: 1, quantity: 1, price: 1750 }],
          deliveryFee: 800,
          tax: 255,
          dailyCreditApplied: false,
        },
      })
    ).rejects.toThrow();
  });
});
