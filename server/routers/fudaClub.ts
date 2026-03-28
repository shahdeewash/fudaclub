/**
 * FÜDA Club router — personal subscription plan
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  fudaClubSubscriptions,
  fudaCoins,
  fudaClosureDates,
  users,
} from "../../drizzle/schema";
import { eq, and, gt, desc, gte, lte } from "drizzle-orm";
import Stripe from "stripe";
import { FUDA_CLUB } from "../stripe-products";
import { nanoid } from "nanoid";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Midnight Darwin time as UTC Date for a given Darwin date string YYYY-MM-DD */
function darwinMidnight(darwinDateStr: string): Date {
  const [y, m, d] = darwinDateStr.split("-").map(Number);
  // 00:00 Darwin (UTC+9:30) = 14:30 UTC previous calendar day
  return new Date(Date.UTC(y, m - 1, d, 14, 30, 0));
}

/** Check if a user has an active FÜDA Club subscription */
export async function getActiveFudaClubSub(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [sub] = await db
    .select()
    .from(fudaClubSubscriptions)
    .where(eq(fudaClubSubscriptions.userId, userId))
    .limit(1);
  if (!sub) return null;
  if (sub.status === "canceled") return null;
  if (sub.status === "frozen") {
    if (sub.frozenUntil && sub.frozenUntil < new Date()) {
      // auto-unfreeze
      await db
        .update(fudaClubSubscriptions)
        .set({ status: "active", frozenUntil: null, frozenAt: null })
        .where(eq(fudaClubSubscriptions.id, sub.id));
      return { ...sub, status: "active" as const };
    }
    return sub;
  }
  return sub;
}

/** Get unexpired, unused coins for a user */
export async function getAvailableCoins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(fudaCoins)
    .where(
      and(
        eq(fudaCoins.userId, userId),
        eq(fudaCoins.isUsed, false),
        gt(fudaCoins.expiresAt, now)
      )
    )
    .orderBy(fudaCoins.expiresAt);
}

/** Issue a single FÜDA Coin to a user */
export async function issueFudaCoin(
  userId: number,
  reason: "daily" | "referral" | "streak_bonus" | "rollover" | "admin",
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(fudaCoins).values({ userId, reason, expiresAt, isUsed: false });
}

/** Mark a coin as used on an order */
export async function useFudaCoin(coinId: number, orderId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(fudaCoins)
    .set({ isUsed: true, usedAt: new Date(), usedOnOrderId: orderId })
    .where(eq(fudaCoins.id, coinId));
}

// ─── router ──────────────────────────────────────────────────────────────────

export const fudaClubRouter = router({
  /** Get current user's FÜDA Club status, coin balance, and venue */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    const sub = await getActiveFudaClubSub(userId);
    const coins = await getAvailableCoins(userId);
    const userData = db
      ? (
          await db
            .select({
              venueName: users.venueName,
              venueAddress: users.venueAddress,
              referralCode: users.referralCode,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
        )[0]
      : null;

    return {
      subscription: sub,
      coinBalance: coins.length,
      coins,
      venueName: userData?.venueName ?? null,
      venueAddress: userData?.venueAddress ?? null,
      referralCode: userData?.referralCode ?? null,
    };
  }),

  /** Create Stripe Checkout session for FÜDA Club signup */
  subscribe: protectedProcedure
    .input(
      z.object({
        origin: z.string().url(),
        referralCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();

      // Check not already subscribed
      const existing = await getActiveFudaClubSub(userId);
      if (existing && existing.status !== "canceled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have an active FÜDA Club subscription.",
        });
      }

      // Get user data
      const userData = db
        ? (
            await db
              .select({ referralCode: users.referralCode, email: users.email, name: users.name })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1)
          )[0]
        : null;

      // Ensure user has a referral code
      if (db && !userData?.referralCode) {
        const code = nanoid(10).toUpperCase();
        await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
      }

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: userData?.email ?? undefined,
        name: userData?.name ?? undefined,
        metadata: { userId: userId.toString() },
      });

      // Create checkout session:
      // - $80 intro: charged as a one-time add_invoice_item on the first invoice
      // - $180 fortnightly: the recurring subscription
      // - 14-day trial so the recurring charge starts after the intro period
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club",
                description: "Mon–Sat · 1 FÜDA Coin/day · 10% off extras",
              },
              recurring: {
                interval: FUDA_CLUB.interval,
                interval_count: FUDA_CLUB.intervalCount,
              },
              unit_amount: FUDA_CLUB.recurringPriceCents,
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: FUDA_CLUB.trialDays,
          metadata: {
            userId: userId.toString(),
            referralCode: input.referralCode ?? "",
            planType: "fuda_club",
          },
        },
        allow_promotion_codes: true,
        client_reference_id: userId.toString(),
        success_url: `${input.origin}/fuda-club?success=1`,
        cancel_url: `${input.origin}/fuda-club?canceled=1`,
        metadata: {
          userId: userId.toString(),
          planType: "fuda_club",
          referralCode: input.referralCode ?? "",
        },
      });

      // Store pending subscription record
      if (db) {
        await db
          .insert(fudaClubSubscriptions)
          .values({
            userId,
            stripeCustomerId: customer.id,
            status: "trialing",
            introUsed: false,
            cancelAtPeriodEnd: false,
          })
          .onDuplicateKeyUpdate({
            set: { stripeCustomerId: customer.id, status: "trialing" },
          });
      }

      return { checkoutUrl: session.url };
    }),

  /** Cancel subscription at period end */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const sub = await getActiveFudaClubSub(userId);
    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
    }
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    const db = await getDb();
    if (db) {
      await db
        .update(fudaClubSubscriptions)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(fudaClubSubscriptions.userId, userId));
    }
    return { success: true };
  }),

  /** Freeze subscription for up to 14 days */
  freezeSubscription: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(FUDA_CLUB.maxFreezeDays) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const sub = await getActiveFudaClubSub(userId);
      if (!sub) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
      }
      if (sub.status === "frozen") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subscription is already frozen." });
      }
      const frozenUntil = new Date();
      frozenUntil.setDate(frozenUntil.getDate() + input.days);
      const db = await getDb();
      if (db) {
        await db
          .update(fudaClubSubscriptions)
          .set({ status: "frozen", frozenAt: new Date(), frozenUntil })
          .where(eq(fudaClubSubscriptions.userId, userId));
      }
      return { frozenUntil };
    }),

  /** Unfreeze subscription early */
  unfreezeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });
    const [sub] = await db
      .select()
      .from(fudaClubSubscriptions)
      .where(eq(fudaClubSubscriptions.userId, userId))
      .limit(1);
    if (!sub || sub.status !== "frozen") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Subscription is not frozen." });
    }
    await db
      .update(fudaClubSubscriptions)
      .set({ status: "active", frozenUntil: null, frozenAt: null })
      .where(eq(fudaClubSubscriptions.userId, userId));
    return { success: true };
  }),

  /** Get coin transaction history */
  getCoinHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(fudaCoins)
      .where(eq(fudaCoins.userId, ctx.user.id))
      .orderBy(desc(fudaCoins.createdAt))
      .limit(60);
  }),

  /** Update workplace venue */
  updateVenue: protectedProcedure
    .input(
      z.object({
        venueName: z.string().min(1).max(255),
        venueAddress: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });
      await db
        .update(users)
        .set({ venueName: input.venueName, venueAddress: input.venueAddress ?? null })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  /** Get or generate referral code and shareable link */
  getReferralLink: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });
      let [userData] = await db
        .select({ referralCode: users.referralCode })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userData?.referralCode) {
        const code = nanoid(10).toUpperCase();
        await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
        userData = { referralCode: code };
      }
      return {
        referralCode: userData.referralCode!,
        referralLink: `${input.origin}/fuda-club?ref=${userData.referralCode}`,
      };
    }),

  /** Apply a referral code when subscribing */
  applyReferralCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });

      const [referrer] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.referralCode, input.code.toUpperCase()))
        .limit(1);

      if (!referrer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid referral code." });
      }
      if (referrer.id === userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot use your own referral code." });
      }

      const [me] = await db
        .select({ referredBy: users.referredBy })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (me?.referredBy) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You have already used a referral code." });
      }

      await db.update(users).set({ referredBy: referrer.id }).where(eq(users.id, userId));

      // Issue 1 coin each — expires tomorrow midnight Darwin
      const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
        timeZone: "Australia/Darwin",
      });
      const expires = darwinMidnight(tomorrowStr);
      await issueFudaCoin(referrer.id, "referral", expires);
      await issueFudaCoin(userId, "referral", expires);

      return { success: true, referrerName: referrer.name };
    }),

  /** Preview FÜDA Club pricing for a cart before checkout */
  getCheckoutPreview: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            menuItemId: z.number(),
            quantity: z.number().min(1),
            modifierNote: z.string().optional(),
          })
        ),
        venueOrderCount: z.number().default(0), // orders from same venue today
      })
    )
    .query(async ({ ctx, input }) => {
      const sub = await getActiveFudaClubSub(ctx.user.id);
      if (!sub || sub.status === "frozen") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No active FÜDA Club subscription." });
      }
      const coins = await getAvailableCoins(ctx.user.id);
      const hasCoin = coins.length > 0;

      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });

      const { menuItems } = await import("../../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const ids = input.items.map(i => i.menuItemId);
      const menuItemsData = await dbInstance.select().from(menuItems).where(inArray(menuItems.id, ids));
      const menuItemMap = new Map(menuItemsData.map(m => [m.id, m]));

      const cartItems: ClubCartItem[] = input.items.map(i => {
        const m = menuItemMap.get(i.menuItemId);
        if (!m) throw new TRPCError({ code: "NOT_FOUND", message: `Item ${i.menuItemId} not found` });
        return {
          menuItemId: i.menuItemId,
          name: m.name,
          category: m.category ?? "",
          quantity: i.quantity,
          unitPriceInCents: m.price,
          modifierNote: i.modifierNote,
        };
      });

      // Delivery: free if 5+ orders from same venue today
      const isFreeDelivery = (input.venueOrderCount + 1) >= 5;
      const deliveryFeeInCents = isFreeDelivery ? 0 : 800;

      return calculateClubPricing(cartItems, hasCoin, deliveryFeeInCents);
    }),

  /** Create Stripe checkout session for a FÜDA Club food order */
  createFoodCheckout: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            menuItemId: z.number(),
            quantity: z.number().min(1),
            modifierNote: z.string().optional(),
          })
        ),
        origin: z.string().url(),
        venueOrderCount: z.number().default(0),
        specialInstructions: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sub = await getActiveFudaClubSub(ctx.user.id);
      if (!sub || sub.status === "frozen") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No active FÜDA Club subscription." });
      }

      const coins = await getAvailableCoins(ctx.user.id);
      const hasCoin = coins.length > 0;

      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });

      const { menuItems } = await import("../../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const ids = input.items.map(i => i.menuItemId);
      const menuItemsData = await dbInstance.select().from(menuItems).where(inArray(menuItems.id, ids));
      const menuItemMap = new Map(menuItemsData.map(m => [m.id, m]));

      const cartItems: ClubCartItem[] = input.items.map(i => {
        const m = menuItemMap.get(i.menuItemId);
        if (!m) throw new TRPCError({ code: "NOT_FOUND", message: `Item ${i.menuItemId} not found` });
        return {
          menuItemId: i.menuItemId,
          name: m.name,
          category: m.category ?? "",
          quantity: i.quantity,
          unitPriceInCents: m.price,
          modifierNote: i.modifierNote,
        };
      });

      const isFreeDelivery = (input.venueOrderCount + 1) >= 5;
      const deliveryFeeInCents = isFreeDelivery ? 0 : 800;
      const preview = calculateClubPricing(cartItems, hasCoin, deliveryFeeInCents);

      // If total is $0 (all covered by coin, no delivery fee), create order directly
      if (preview.totalInCents === 0) {
        // Create order directly without Stripe
        const { orders, orderItems } = await import("../../drizzle/schema");
        const nowDarwin = new Date();
        const darwinOffset = 9.5 * 60 * 60 * 1000;
        const darwinNow = new Date(nowDarwin.getTime() + darwinOffset);
        const darwinHour = darwinNow.getUTCHours();
        const darwinMinute = darwinNow.getUTCMinutes();
        const isPastCutoff = darwinHour > 10 || (darwinHour === 10 && darwinMinute >= 30);

        const orderNumber = `FC-${nanoid(8).toUpperCase()}`;
        const [newOrder] = await dbInstance
          .insert(orders)
          .values({
            userId: ctx.user.id,
            companyId: ctx.user.companyId ?? 0, // FÜDA Club orders may not have a company
            orderNumber,
            orderDate: new Date(),
            status: "confirmed",
            fulfillmentType: (isFreeDelivery && !isPastCutoff) ? "delivery" : "pickup",
            isFreeDelivery,
            dailyCreditUsed: preview.coinUsed,
            subtotal: preview.subtotalInCents,
            deliveryFee: preview.deliveryFeeInCents,
            tax: 0,
            total: preview.totalInCents,
            specialInstructions: input.specialInstructions,
          });
        const orderId = (newOrder as any).insertId;

        for (const item of preview.items) {
          await dbInstance.insert(orderItems).values({
            orderId,
            menuItemId: item.menuItemId,
            itemName: item.name,
            quantity: item.quantity,
            unitPrice: item.discountedPriceInCents,
            totalPrice: item.discountedPriceInCents * item.quantity,
            isFree: item.isCoinCovered,
          });
        }

        // Mark coin as used
        if (preview.coinUsed && coins[0]) {
          await useFudaCoin(coins[0].id, orderId);
        }

        return { orderId, orderNumber, requiresPayment: false, checkoutUrl: null };
      }

      // Otherwise create Stripe checkout session
      const lineItems = preview.items
        .filter(item => item.discountedPriceInCents > 0)
        .map(item => ({
          price_data: {
            currency: "aud",
            product_data: { name: item.isCoinCovered ? `${item.name} (FÜDA Coin)` : item.discount10pct ? `${item.name} (10% off)` : item.name },
            unit_amount: item.discountedPriceInCents,
          },
          quantity: item.quantity,
        }));

      if (preview.deliveryFeeInCents > 0) {
        lineItems.push({
          price_data: {
            currency: "aud",
            product_data: { name: "Delivery Fee" },
            unit_amount: preview.deliveryFeeInCents,
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: "payment",
        customer_email: ctx.user.email ?? undefined,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          plan_type: "fuda_club",
          coin_used: preview.coinUsed ? "1" : "0",
          coin_id: preview.coinUsed && coins[0] ? coins[0].id.toString() : "",
          order_data: JSON.stringify({
            items: input.items,
            deliveryFee: preview.deliveryFeeInCents,
            tax: 0,
            coinUsed: preview.coinUsed,
            specialInstructions: input.specialInstructions,
          }),
        },
        success_url: `${input.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/fuda-club/order`,
        allow_promotion_codes: true,
      });

      return { orderId: null, orderNumber: null, requiresPayment: true, checkoutUrl: session.url };
    }),

  // ─── Closure Date Management (admin only) ────────────────────────────────

  /** List all FÜDA closure dates */
  listClosureDates: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(fudaClosureDates)
      .orderBy(desc(fudaClosureDates.closureDate));
  }),

  /** Add a closure date (YYYY-MM-DD in Darwin time) */
  addClosureDate: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Parse YYYY-MM-DD string into a Date (midnight UTC)
      const [y, m, d] = input.date.split("-").map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d));
      await db
        .insert(fudaClosureDates)
        .values({ closureDate: dateObj, reason: input.reason ?? null })
        .onDuplicateKeyUpdate({ set: { reason: input.reason ?? null } });
      return { success: true };
    }),

  /** Remove a closure date */
  removeClosureDate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(fudaClosureDates).where(eq(fudaClosureDates.id, input.id));
      return { success: true };
    }),

  /** Get upcoming closure dates (next 30 days) — public so customers can see */
  getUpcomingClosures: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const todayDate = new Date(Date.UTC(ty, tm - 1, td));
    const in30DaysDate = new Date(todayDate.getTime() + 30 * 86400000);
    return db
      .select()
      .from(fudaClosureDates)
      .where(and(gte(fudaClosureDates.closureDate, todayDate), lte(fudaClosureDates.closureDate, in30DaysDate)))
      .orderBy(fudaClosureDates.closureDate);
  }),
});

// ─── checkout helpers ─────────────────────────────────────────────────────────

export interface ClubCartItem {
  menuItemId: number;
  name: string;
  category: string;
  quantity: number;
  unitPriceInCents: number; // original price
  modifierNote?: string;
}

export interface ClubCheckoutPreview {
  items: Array<{
    menuItemId: number;
    name: string;
    quantity: number;
    unitPriceInCents: number;
    discountedPriceInCents: number;
    isCoinCovered: boolean;
    isMixGrill: boolean;
    discount10pct: boolean;
  }>;
  coinUsed: boolean;
  subtotalInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  minDeliveryMet: boolean;
}

/**
 * Calculate FÜDA Club pricing for a cart:
 * - First non-Mix-Grill item: covered by coin (free) if coin available
 * - Mix Grill items: 10% off (coin cannot be used)
 * - All other items beyond coin-covered one: 10% off
 */
export function calculateClubPricing(
  cartItems: ClubCartItem[],
  hasCoin: boolean,
  deliveryFeeInCents: number
): ClubCheckoutPreview {
  const DISCOUNT = 0.10;
  const MIX_GRILL = FUDA_CLUB.mixGrillCategory.toLowerCase();

  let coinUsed = false;
  let subtotal = 0;

  const items = cartItems.flatMap(item => {
    const isMixGrill = item.category.toLowerCase().includes(MIX_GRILL);
    const results = [];

    for (let i = 0; i < item.quantity; i++) {
      const original = item.unitPriceInCents;
      let discounted = original;
      let isCoinCovered = false;
      let discount10pct = false;

      if (!isMixGrill && hasCoin && !coinUsed) {
        // First non-Mix-Grill unit is free via coin
        isCoinCovered = true;
        coinUsed = true;
        discounted = 0;
      } else {
        // 10% off for Mix Grill and all additional items
        discount10pct = true;
        discounted = Math.round(original * (1 - DISCOUNT));
      }

      subtotal += discounted;
      results.push({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: 1,
        unitPriceInCents: original,
        discountedPriceInCents: discounted,
        isCoinCovered,
        isMixGrill,
        discount10pct,
      });
    }
    return results;
  });

  // Collapse back to grouped items for display
  const grouped = new Map<string, typeof items[0]>();
  for (const item of items) {
    const key = `${item.menuItemId}-${item.isCoinCovered}-${item.discount10pct}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, { ...item });
    }
  }

  const groupedItems = Array.from(grouped.values());
  const minDeliveryMet = subtotal >= FUDA_CLUB.minDeliverySubtotalCents;
  const actualDeliveryFee = minDeliveryMet ? deliveryFeeInCents : 0;
  const total = subtotal + actualDeliveryFee;

  return {
    items: groupedItems,
    coinUsed,
    subtotalInCents: subtotal,
    deliveryFeeInCents: actualDeliveryFee,
    totalInCents: total,
    minDeliveryMet,
  };
}
