import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { menuItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("menu.create", () => {
  const caller = appRouter.createCaller({
    user: { openId: "admin-test", name: "Admin Test", email: "admin@test.com", role: "admin" },
    req: {} as any,
    res: {} as any,
  });

  it("should convert price from dollars to cents", async () => {
    // Create a menu item with price in dollars
    const result = await caller.menu.create({
      name: "Test Dish",
      description: "Test description",
      price: 17.50, // Input in dollars
      category: "mains",
      imageUrl: "https://example.com/test.jpg",
      available: true,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();

    // Fetch from database to verify price was stored in cents
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const items = await db.select().from(menuItems).where(eq(menuItems.id, result.id)).limit(1);
    const item = items[0];

    expect(item).toBeDefined();
    expect(item!.price).toBe(1750); // Should be stored as 1750 cents, not 17 cents
    expect(item!.name).toBe("Test Dish");

    // Clean up
    const dbCleanup = await getDb();
    if (dbCleanup) {
      await dbCleanup.delete(menuItems).where(eq(menuItems.id, result.id));
    }
  });

  it("should handle whole dollar amounts correctly", async () => {
    const result = await caller.menu.create({
      name: "Whole Dollar Test",
      description: "Test",
      price: 20.00, // Whole dollars
      category: "sides",
      available: true,
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const items = await db.select().from(menuItems).where(eq(menuItems.id, result.id)).limit(1);
    const item = items[0];

    expect(item!.price).toBe(2000); // Should be 2000 cents

    // Clean up
    const dbCleanup = await getDb();
    if (dbCleanup) {
      await dbCleanup.delete(menuItems).where(eq(menuItems.id, result.id));
    }
  });

  it("should handle prices with single decimal correctly", async () => {
    const result = await caller.menu.create({
      name: "Single Decimal Test",
      description: "Test",
      price: 15.5, // 15.5 dollars
      category: "drinks",
      available: true,
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const items = await db.select().from(menuItems).where(eq(menuItems.id, result.id)).limit(1);
    const item = items[0];

    expect(item!.price).toBe(1550); // Should be 1550 cents

    // Clean up
    const dbCleanup = await getDb();
    if (dbCleanup) {
      await dbCleanup.delete(menuItems).where(eq(menuItems.id, result.id));
    }
  });
});
