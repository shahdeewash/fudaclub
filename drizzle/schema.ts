import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, unique } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "kitchen"]).default("user").notNull(),
  companyId: int("companyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Companies detected from email domains
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  deliveryThreshold: int("deliveryThreshold").default(5).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * Subscription records (fortnightly billing)
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing"]).default("active").notNull(),
  planAmount: int("planAmount").default(2500).notNull(), // in cents
  currentPeriodStart: timestamp("currentPeriodStart").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  planType: mysqlEnum("planType", ["fortnightly", "monthly"]).default("fortnightly").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Menu items from Square catalog
 */
export const menuItems = mysqlTable("menuItems", {
  id: int("id").autoincrement().primaryKey(),
  squareCatalogId: varchar("squareCatalogId", { length: 255 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  price: int("price").notNull(), // in cents
  imageUrl: text("imageUrl"),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isTodaysSpecial: boolean("isTodaysSpecial").default(false).notNull(),
  specialDate: timestamp("specialDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

/**
 * Orders placed by users
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  squareOrderId: varchar("squareOrderId", { length: 255 }),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull().unique(),
  orderDate: timestamp("orderDate").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "arrived", "preparing", "ready", "delivered", "canceled"]).default("pending").notNull(),
  fulfillmentType: mysqlEnum("fulfillmentType", ["delivery", "pickup"]).default("pickup").notNull(),
  isFreeDelivery: boolean("isFreeDelivery").default(false).notNull(),
  dailyCreditUsed: boolean("dailyCreditUsed").default(false).notNull(),
  subtotal: int("subtotal").notNull(), // in cents
  deliveryFee: int("deliveryFee").default(0).notNull(), // in cents
  tax: int("tax").default(0).notNull(), // in cents
  total: int("total").notNull(), // in cents
  specialInstructions: text("specialInstructions"),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  pushedToKdsAt: timestamp("pushedToKdsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Individual items in an order
 */
export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: int("unitPrice").notNull(), // in cents
  totalPrice: int("totalPrice").notNull(), // in cents
  isFree: boolean("isFree").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * Daily credit tracking (one free meal per day per user)
 */
export const dailyCredits = mysqlTable("dailyCredits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  creditDate: timestamp("creditDate").notNull(),
  isUsed: boolean("isUsed").default(false).notNull(),
  usedAt: timestamp("usedAt"),
  orderId: int("orderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userDateUnique: unique().on(table.userId, table.creditDate),
}));

export type DailyCredit = typeof dailyCredits.$inferSelect;
export type InsertDailyCredit = typeof dailyCredits.$inferInsert;
