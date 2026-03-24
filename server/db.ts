import { and, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  companies, 
  Company, 
  InsertCompany,
  subscriptions,
  Subscription,
  InsertSubscription,
  menuItems,
  MenuItem,
  InsertMenuItem,
  orders,
  Order,
  InsertOrder,
  orderItems,
  OrderItem,
  InsertOrderItem,
  dailyCredits,
  DailyCredit,
  InsertDailyCredit
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (user.companyId !== undefined) {
      values.companyId = user.companyId;
      updateSet.companyId = user.companyId;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Company helpers
export async function getCompanyByDomain(domain: string): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCompany(company: InsertCompany): Promise<Company> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(companies).values(company);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return created[0]!;
}

export async function getAllCompanies(): Promise<Company[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(companies);
}

// Subscription helpers
export async function getActiveSubscriptionByUserId(userId: number): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, 'active')
    ))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createSubscription(subscription: InsertSubscription): Promise<Subscription> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(subscriptions).values(subscription);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return created[0]!;
}

// Menu item helpers
export async function getAllMenuItems(): Promise<MenuItem[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(menuItems).where(eq(menuItems.isAvailable, true));
}

export async function getTodaysSpecial(): Promise<MenuItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select()
    .from(menuItems)
    .where(and(
      eq(menuItems.isTodaysSpecial, true),
      eq(menuItems.isAvailable, true)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function setTodaysSpecial(menuItemId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Clear all existing specials
  await db.update(menuItems).set({ isTodaysSpecial: false });

  // Set new special
  const today = new Date();
  await db.update(menuItems)
    .set({ isTodaysSpecial: true, specialDate: today })
    .where(eq(menuItems.id, menuItemId));
}

export async function createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(menuItems).values(item);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return created[0]!;
}

export async function updateMenuItemImage(menuItemId: number, imageUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(menuItems).set({ imageUrl }).where(eq(menuItems.id, menuItemId));
}

export async function updateMenuItem(
  menuItemId: number,
  updates: { name?: string; description?: string; price?: number; category?: string; imageUrl?: string; isAvailable?: boolean }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(menuItems).set(updates).where(eq(menuItems.id, menuItemId));
}

export async function deleteMenuItem(menuItemId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Soft delete - mark as unavailable instead of hard delete to preserve order history
  await db.update(menuItems).set({ isAvailable: false }).where(eq(menuItems.id, menuItemId));
}

// Daily credit helpers
export async function getDailyCreditForToday(userId: number): Promise<DailyCredit | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await db
    .select()
    .from(dailyCredits)
    .where(and(
      eq(dailyCredits.userId, userId),
      gte(dailyCredits.creditDate, today),
      lte(dailyCredits.creditDate, tomorrow)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createDailyCredit(credit: InsertDailyCredit): Promise<DailyCredit> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(dailyCredits).values(credit);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(dailyCredits).where(eq(dailyCredits.id, id)).limit(1);
  return created[0]!;
}

export async function markDailyCreditAsUsed(creditId: number, orderId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dailyCredits)
    .set({ isUsed: true, usedAt: new Date(), orderId })
    .where(eq(dailyCredits.id, creditId));
}

// Order helpers
export async function createOrder(order: InsertOrder): Promise<Order> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(orders).values(order);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return created[0]!;
}

export async function createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(orderItems).values(item);
  const id = Number(result[0].insertId);
  
  const created = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  return created[0]!;
}

export async function getOrdersByCompanyToday(companyId: number): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.companyId, companyId),
      gte(orders.orderDate, today),
      lte(orders.orderDate, tomorrow)
    ));
}

export async function getAllOrdersToday(): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return await db
    .select()
    .from(orders)
    .where(and(
      gte(orders.orderDate, today),
      lte(orders.orderDate, tomorrow)
    ));
}

export async function getOrderItemsByOrderId(orderId: number): Promise<OrderItem[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function updateOrderStatus(orderId: number, status: Order['status']): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(orders).set({ status }).where(eq(orders.id, orderId));
}

export async function getUsersByCompanyId(companyId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.companyId, companyId));
}

// Get all orders (not just today's) for admin/KDS
export async function getAllOrders(): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  const { desc } = await import('drizzle-orm');
  return await db.select().from(orders).orderBy(desc(orders.orderDate));
}

// Get all orders with optional date filter
export async function getAllOrdersFiltered(dateFilter?: 'today' | 'yesterday' | 'week' | 'all'): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  const { desc } = await import('drizzle-orm');

  if (!dateFilter || dateFilter === 'all') {
    return await db.select().from(orders).orderBy(desc(orders.orderDate));
  }

  const now = new Date();
  let startDate: Date;

  if (dateFilter === 'today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (dateFilter === 'yesterday') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    return await db.select().from(orders)
      .where(and(gte(orders.orderDate, startDate), lte(orders.orderDate, endDate)))
      .orderBy(desc(orders.orderDate));
  } else if (dateFilter === 'week') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else {
    return await db.select().from(orders).orderBy(desc(orders.orderDate));
  }

  return await db.select().from(orders)
    .where(gte(orders.orderDate, startDate))
    .orderBy(desc(orders.orderDate));
}

// Find an order by Stripe session ID (for idempotency in webhook handler)
export async function getOrderByStripeSessionId(sessionId: string): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);
  return result[0] ?? null;
}
