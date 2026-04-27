import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, unique, date } from "drizzle-orm/mysql-core";

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
  // FÜDA Club fields
  venueName: varchar("venueName", { length: 255 }),       // e.g. "Darwin CBD Office"
  venueAddress: text("venueAddress"),                      // full address for delivery pooling
  referralCode: varchar("referralCode", { length: 32 }).unique(), // unique code to share
  referredBy: int("referredBy"),                          // userId of referrer
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
  squareVariationId: varchar("squareVariationId", { length: 255 }),  // Square ITEM_VARIATION ID for Orders API
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  price: int("price").notNull(), // in cents
  imageUrl: text("imageUrl"),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
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
  modifierNote: text("modifierNote"), // e.g. "Spice Level: Hot, Extras: Extra Protein"
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

/**
 * Square OAuth connections — one per admin user
 */
export const squareConnections = mysqlTable("squareConnections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  merchantId: varchar("merchantId", { length: 255 }),
  merchantName: varchar("merchantName", { length: 255 }),
  locationId: varchar("locationId", { length: 255 }),
  terminalDeviceId: varchar("terminalDeviceId", { length: 255 }), // Square Terminal device ID for receipt printing
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SquareConnection = typeof squareConnections.$inferSelect;
export type InsertSquareConnection = typeof squareConnections.$inferInsert;

/**
 * Modifier lists synced from Square (e.g. "Spice Level", "Extras")
 */
export const modifierLists = mysqlTable("modifierLists", {
  id: int("id").autoincrement().primaryKey(),
  squareModifierListId: varchar("squareModifierListId", { length: 255 }).unique(), // nullable for manually-created lists
  name: varchar("name", { length: 255 }).notNull(),
  selectionType: mysqlEnum("selectionType", ["SINGLE", "MULTIPLE"]).default("SINGLE").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModifierList = typeof modifierLists.$inferSelect;
export type InsertModifierList = typeof modifierLists.$inferInsert;

/**
 * Individual modifiers within a list (e.g. "Mild", "Hot", "Extra Hot")
 */
export const modifiers = mysqlTable("modifiers", {
  id: int("id").autoincrement().primaryKey(),
  squareModifierId: varchar("squareModifierId", { length: 255 }).unique(), // nullable for manually-created options
  modifierListId: int("modifierListId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  priceInCents: int("priceInCents").default(0).notNull(),
  ordinal: int("ordinal").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = typeof modifiers.$inferInsert;

/**
 * Links modifier lists to menu items (many-to-many)
 */
export const menuItemModifierLists = mysqlTable("menuItemModifierLists", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  modifierListId: int("modifierListId").notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
});

export type MenuItemModifierList = typeof menuItemModifierLists.$inferSelect;
export type InsertMenuItemModifierList = typeof menuItemModifierLists.$inferInsert;

/**
 * FÜDA Club personal subscriptions
 */
export const fudaClubSubscriptions = mysqlTable("fudaClubSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing", "frozen"]).default("active").notNull(),
  introUsed: boolean("introUsed").default(false).notNull(),   // true after first $80 period
  frozenUntil: timestamp("frozenUntil"),                       // null = not frozen
  frozenAt: timestamp("frozenAt"),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  planType: mysqlEnum("planType", ["trial", "fortnightly", "monthly"]).default("trial").notNull(),
  // Founding-50 pricing: first 50 active subscribers lock in launch pricing for 12 months.
  // After that, prices increase 20% but founders get a 5% loyalty discount.
  isFoundingMember: boolean("isFoundingMember").default(false).notNull(),
  lockedPriceUntil: timestamp("lockedPriceUntil"),
  // Coin grace period: when a member cancels, they lose 10% off immediately but
  // keep the right to redeem existing coins until coinGraceUntil (≈ end of paid period).
  coinGraceUntil: timestamp("coinGraceUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FudaClubSubscription = typeof fudaClubSubscriptions.$inferSelect;
export type InsertFudaClubSubscription = typeof fudaClubSubscriptions.$inferInsert;

/**
 * FÜDA Coins — daily credits for FÜDA Club members
 * 1 coin = 1 free non-Mix-Grill item; Mix Grill gets 10% off instead
 */
export const fudaCoins = mysqlTable("fudaCoins", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reason: mysqlEnum("reason", ["daily", "referral", "streak_bonus", "rollover", "admin"]).default("daily").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),              // midnight same day (or next open day for rollover)
  usedAt: timestamp("usedAt"),
  usedOnOrderId: int("usedOnOrderId"),
  isUsed: boolean("isUsed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FudaCoin = typeof fudaCoins.$inferSelect;
export type InsertFudaCoin = typeof fudaCoins.$inferInsert;

/**
 * FÜDA closure dates — coins roll over when FÜDA is closed
 */
export const fudaClosureDates = mysqlTable("fudaClosureDates", {
  id: int("id").autoincrement().primaryKey(),
  closureDate: date("closureDate").notNull().unique(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FudaClosureDate = typeof fudaClosureDates.$inferSelect;
export type InsertFudaClosureDate = typeof fudaClosureDates.$inferInsert;
