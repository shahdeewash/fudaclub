/**
 * FÜDA Club router — personal subscription plan
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
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
import { createSquareOrderForPrinting, printReceiptOnTerminal } from "../square";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

/**
 * Lazy get-or-create the trial intro coupon.
 * Discounts the FIRST invoice of the trial plan from $180 → $80.
 * Cached in process memory after first use; survives until the server restarts.
 */
let _cachedTrialCouponId: string | null = null;
async function getTrialIntroCouponId(): Promise<string> {
  if (_cachedTrialCouponId) return _cachedTrialCouponId;

  // Try to reuse an existing coupon tagged with metadata.fudaClub = "trial_intro"
  try {
    const existing = await stripe.coupons.list({ limit: 100 });
    const found = existing.data.find(
      (c) => c.metadata?.fudaClub === "trial_intro" && c.valid && c.amount_off === FUDA_CLUB.trialDiscountCents
    );
    if (found) {
      _cachedTrialCouponId = found.id;
      return found.id;
    }
  } catch {
    // fall through to create
  }

  const created = await stripe.coupons.create({
    amount_off: FUDA_CLUB.trialDiscountCents,
    currency: FUDA_CLUB.currency,
    duration: "once",
    name: "FÜDA Club — First fortnight intro",
    metadata: { fudaClub: "trial_intro" },
  });
  _cachedTrialCouponId = created.id;
  return created.id;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Midnight Darwin time as UTC Date for a given Darwin date string YYYY-MM-DD */
function darwinMidnight(darwinDateStr: string): Date {
  const [y, m, d] = darwinDateStr.split("-").map(Number);
  // 00:00 Darwin (UTC+9:30) = 14:30 UTC previous calendar day
  return new Date(Date.UTC(y, m - 1, d, 14, 30, 0));
}

/**
 * Check if a user is in their post-cancel coin grace window — they still have
 * unused FÜDA Coins and the period they paid for hasn't ended, so they can
 * spend coins but get NO 10% member discount on anything else in the cart.
 *
 * Returns the subscription row if grace is live, otherwise null.
 */
export async function getCoinGracePeriodSub(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [sub] = await db
    .select()
    .from(fudaClubSubscriptions)
    .where(eq(fudaClubSubscriptions.userId, userId))
    .limit(1);
  if (!sub) return null;
  if (sub.status !== "canceled") return null;
  if (!sub.coinGraceUntil) return null;
  if (sub.coinGraceUntil < new Date()) return null;
  return sub;
}

/** Check if a user has an active FÜDA Club subscription.
 *  Returns null for any state that should NOT grant member benefits:
 *  - status === "canceled" (immediate-cancel flow set this directly)
 *  - cancelAtPeriodEnd=true AND currentPeriodEnd has passed (safety net for
 *    when Stripe webhooks haven't fired or weren't wired up — we don't want
 *    a forgotten cancellation to leave a member with eternal free coins)
 *  Frozen subs auto-unfreeze if their freeze window has passed.
 */
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
  // Safety net: cancelAtPeriodEnd=true + currentPeriodEnd in the past = effectively canceled.
  // Auto-flip the local status so future checks short-circuit on the cheap path above.
  if (
    sub.cancelAtPeriodEnd &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd < new Date()
  ) {
    await db
      .update(fudaClubSubscriptions)
      .set({ status: "canceled" })
      .where(eq(fudaClubSubscriptions.id, sub.id));
    return null;
  }
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

/**
 * Count active (non-cancelled, non-frozen) FÜDA Club members at a given workplace.
 * "Workplace" = users.venueName (case-insensitive, whitespace-trimmed match).
 *
 * Used by the delivery-pricing rule: when a workplace has 5+ active members,
 * delivery is free for every order from anyone there. Stable, predictable, doesn't
 * punish first-movers (unlike "5 orders today").
 */
export async function countActiveClubMembersAtVenue(venueName: string | null | undefined): Promise<number> {
  if (!venueName || !venueName.trim()) return 0;
  const db = await getDb();
  if (!db) return 0;
  const normalized = venueName.trim().toLowerCase();
  // Pull all member+venue+status rows once and filter in JS so we don't depend on
  // the database's collation for case-insensitive matching (varies by MySQL config).
  const rows = await db
    .select({ venueName: users.venueName, status: fudaClubSubscriptions.status })
    .from(users)
    .innerJoin(fudaClubSubscriptions, eq(fudaClubSubscriptions.userId, users.id));
  return rows.filter(r =>
    r.venueName &&
    r.venueName.trim().toLowerCase() === normalized &&
    r.status !== "canceled" &&
    r.status !== "frozen"
  ).length;
}

/** Minimum order subtotal (cents) for delivery — protects against $5 deliveries. */
export const MIN_DELIVERY_SUBTOTAL_CENTS = 1500; // $15.00

/** Total spots reserved for founding-50 launch pricing. After this many active subs,
 *  new sign-ups pay the post-launch price (currently +20%). Founders' own price is
 *  locked for 12 months from sign-up. */
export const FOUNDING_MEMBER_CAP = 50;

/** Count active (non-canceled, non-frozen) FÜDA Club subscriptions across all users. */
export async function countActiveClubSubscriptions(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ status: fudaClubSubscriptions.status })
    .from(fudaClubSubscriptions);
  return rows.filter(r => r.status !== "canceled").length;
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
  /**
   * Public — used by the homepage to power the founding-50 progress bar.
   * Anyone can call this (no login required) so visitors see "X / 50 spots taken"
   * before they sign up. Returns counts only — no PII.
   */
  getFoundingProgress: publicProcedure.query(async () => {
    const taken = await countActiveClubSubscriptions();
    const cap = FOUNDING_MEMBER_CAP;
    const remaining = Math.max(0, cap - taken);
    const isFoundingWindowOpen = taken < cap;
    return {
      cap,
      taken,
      remaining,
      isFoundingWindowOpen,
      // Round percentage for a smooth progress-bar fill on the homepage.
      percentFull: Math.min(100, Math.round((taken / cap) * 100)),
    };
  }),

  /** Get current user's FÜDA Club status, coin balance, and venue */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    const sub = await getActiveFudaClubSub(userId);
    // If they're not actively subscribed, check whether they're in the post-cancel
    // coin grace window — they can still spend coins, but no 10% discount.
    const graceSub = sub ? null : await getCoinGracePeriodSub(userId);
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
      // Surface coin-grace state so the UI can render a "Discount paused" banner
      // and let the member spend their remaining coins before the window closes.
      coinGrace: graceSub
        ? {
            active: true,
            until: graceSub.coinGraceUntil,
          }
        : { active: false, until: null },
    };
  }),

  /**
   * Create Stripe Checkout session for FÜDA Club signup.
   * Three plan types:
   *  - "trial":       $180/fortnight recurring + first-invoice coupon ($100 off)
   *                   → user pays $80 on day 1, $180 every 14 days starting day 15
   *  - "fortnightly": $180/fortnight recurring from day 1, no discount
   *  - "monthly":     $350/month recurring from day 1, no discount
   */
  subscribe: protectedProcedure
    .input(
      z.object({
        origin: z.string().url(),
        referralCode: z.string().optional(),
        planType: z.enum(["trial", "fortnightly", "monthly"]).default("trial"),
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

      // ── Plan-specific config ───────────────────────────────────────────────
      const planType = input.planType;

      let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
      let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
      let initialDbStatus: "trialing" | "active";

      if (planType === "monthly") {
        lineItems = [
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club — Monthly",
                description: "Mon–Sat · 1 FÜDA Coin/day · 10% off every order",
              },
              recurring: { interval: "month", interval_count: 1 },
              unit_amount: FUDA_CLUB.monthlyPriceCents,
            },
            quantity: 1,
          },
        ];
        discounts = undefined;
        initialDbStatus = "active";
      } else if (planType === "fortnightly") {
        lineItems = [
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club — Fortnightly",
                description: "Mon–Sat · 1 FÜDA Coin/day · 10% off every order",
              },
              recurring: {
                interval: FUDA_CLUB.interval,
                interval_count: FUDA_CLUB.intervalCount,
              },
              unit_amount: FUDA_CLUB.recurringPriceCents,
            },
            quantity: 1,
          },
        ];
        discounts = undefined;
        initialDbStatus = "active";
      } else {
        // planType === "trial"
        const couponId = await getTrialIntroCouponId();
        lineItems = [
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club — 7-Day Trial",
                description: "First fortnight $80, then $180 every 2 weeks · 1 FÜDA Coin/day · 10% off every order",
              },
              recurring: {
                interval: FUDA_CLUB.interval,
                interval_count: FUDA_CLUB.intervalCount,
              },
              unit_amount: FUDA_CLUB.recurringPriceCents,
            },
            quantity: 1,
          },
        ];
        discounts = [{ coupon: couponId }];
        initialDbStatus = "trialing";
      }

      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: lineItems,
        // discounts and allow_promotion_codes are mutually exclusive in Stripe.
        // For the trial plan we apply our intro coupon; for others we let users
        // paste their own promo codes.
        ...(discounts ? { discounts } : { allow_promotion_codes: true }),
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            referralCode: input.referralCode ?? "",
            planType,
            introCharge: planType === "trial" ? "true" : "false",
          },
        },
        client_reference_id: userId.toString(),
        success_url: `${input.origin}/fuda-club?success=1`,
        cancel_url: `${input.origin}/fuda-club?canceled=1`,
        metadata: {
          userId: userId.toString(),
          planType,
          referralCode: input.referralCode ?? "",
        },
      });

      // Founding-50 — if there are still spots, mark this sub as founding and lock
      // their price for 12 months. After the cap, new subs pay the post-launch rate.
      const currentTaken = await countActiveClubSubscriptions();
      const isFoundingMember = currentTaken < FOUNDING_MEMBER_CAP;
      const lockedPriceUntil = isFoundingMember
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : null;

      // Store pending subscription record
      if (db) {
        await db
          .insert(fudaClubSubscriptions)
          .values({
            userId,
            stripeCustomerId: customer.id,
            status: initialDbStatus,
            introUsed: false,
            cancelAtPeriodEnd: false,
            planType,
            isFoundingMember,
            lockedPriceUntil,
          })
          .onDuplicateKeyUpdate({
            set: {
              stripeCustomerId: customer.id,
              status: initialDbStatus,
              planType,
              // Only flip to founding on duplicate update if they haven't already been
              // marked one — never strip an existing founder of their status.
              ...(isFoundingMember ? { isFoundingMember: true, lockedPriceUntil } : {}),
            },
          });
      }

      return { checkoutUrl: session.url };
    }),

  /** Cancel subscription at period end */
  /**
   * Cancel the member's FÜDA Club subscription with a coin grace period.
   *
   * What happens at the moment of cancel:
   * - The 10% member discount STOPS immediately on every new order.
   * - Existing unused FÜDA Coins remain spendable until `coinGraceUntil` —
   *   that's the end of the period the member already paid for (Stripe's
   *   currentPeriodEnd, or now+14 days if Stripe hasn't synced that yet).
   * - No new coins are issued (cron only issues to status='active' subs).
   * - Stripe is told `cancel_at_period_end: true` so no future billing.
   *
   * After coinGraceUntil:
   * - All access ends — coins become unspendable (the gating check requires
   *   either an active sub or a live coin grace window).
   *
   * This honours what the member paid for (coins they earned during the period)
   * while ending the perpetual perk (10% off) the moment they leave.
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const sub = await getActiveFudaClubSub(userId);
    if (!sub) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
    }
    // Tell Stripe to stop future billing (idempotent — safe to call even if the
    // sub is already canceling). Skipped only if there's no Stripe ID yet
    // (rare edge case for subs that never finished checkout).
    if (sub.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (stripeErr: any) {
        // Log but don't block — we still want to revoke discount access locally
        // even if the Stripe API call fails (e.g. network blip). Worst case:
        // Stripe bills them once more and we issue a refund manually.
        console.error(`[FÜDA Club] Stripe cancel_at_period_end failed for sub ${sub.stripeSubscriptionId}:`, stripeErr?.message ?? stripeErr);
      }
    }
    // Coin grace window — until end of paid period, fallback to 14 days from now.
    const coinGraceUntil = sub.currentPeriodEnd
      ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const db = await getDb();
    if (db) {
      await db
        .update(fudaClubSubscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          coinGraceUntil,
        })
        .where(eq(fudaClubSubscriptions.userId, userId));
    }
    return { success: true, coinGraceUntil: coinGraceUntil.toISOString() };
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

      // Issue 1 coin each — expires 2 days from now (matches standard 2-day rollover policy)
      const inTwoDaysStr = new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-CA", {
        timeZone: "Australia/Darwin",
      });
      const expires = darwinMidnight(inTwoDaysStr);
      await issueFudaCoin(referrer.id, "referral", expires);
      await issueFudaCoin(userId, "referral", expires);

      return { success: true, referrerName: referrer.name };
    }),

  /**
   * Workplace status: how many active club members share the same venueName as the
   * current user, and whether that's enough for free delivery (≥ 5).
   * Used by Checkout, Payment and Profile to show "X / 5 members at your workplace".
   */
  getVenueStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { venueName: null, memberCount: 0, qualifiesForFreeDelivery: false, neededForFreeDelivery: 5 };
    const [me] = await db.select({ venueName: users.venueName }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const venueName = me?.venueName ?? null;
    const memberCount = await countActiveClubMembersAtVenue(venueName);
    const THRESHOLD = 5;
    return {
      venueName,
      memberCount,
      qualifiesForFreeDelivery: memberCount >= THRESHOLD,
      neededForFreeDelivery: Math.max(0, THRESHOLD - memberCount),
    };
  }),

  /**
   * Preview FÜDA Club pricing for a cart before checkout.
   * Fulfillment type controls whether a delivery fee is charged:
   *   - "pickup"   : $0 delivery fee (always)
   *   - "delivery" : $10 delivery fee, OR free if the workplace has 5+ active members
   * Delivery requires a minimum $15 subtotal (after discounts) and is only available
   * within 5km of FÜDA Darwin (9 Searcy St) — UI enforces the radius with a notice
   * today; server-side geocoding check is a follow-up.
   */
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
        fulfillmentType: z.enum(["pickup", "delivery"]).default("pickup"),
        // How many FÜDA Coins the member wants to spend on this order. The server
        // caps this to whatever they actually have available + eligible cart units.
        // Undefined means "use as many as possible" — backwards-compatible default
        // for callers that haven't been updated yet.
        coinsToApply: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Either an active sub (full member: 10% off + coins) OR a canceled sub
      // still in coin grace (coin redemption only, no 10% off) is allowed past
      // this gate. Frozen subs cannot order.
      const activeSub = await getActiveFudaClubSub(ctx.user.id);
      const graceSub = activeSub ? null : await getCoinGracePeriodSub(ctx.user.id);
      const sub = activeSub ?? graceSub;
      if (!sub || sub.status === "frozen") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No active FÜDA Club subscription." });
      }
      const memberDiscountActive = !!activeSub;  // 10% off only for full members
      const coins = await getAvailableCoins(ctx.user.id);
      // Default to spending ALL available coins so members get max savings unless
      // they explicitly opt to spend fewer.
      const coinsToApply = Math.min(
        input.coinsToApply ?? coins.length,
        coins.length
      );

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

      // Pickup = $0. Delivery = $10, OR free if 5+ active club members at this user's
      // workplace (stable, doesn't punish first-movers like the old per-day count).
      const [me] = await dbInstance.select({ venueName: users.venueName }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const memberCount = await countActiveClubMembersAtVenue(me?.venueName);
      const venueQualifies = memberCount >= 5;
      const deliveryFeeInCents = input.fulfillmentType === "pickup"
        ? 0
        : (venueQualifies ? 0 : 1000);

      return {
        ...calculateClubPricing(cartItems, coinsToApply, deliveryFeeInCents, memberDiscountActive),
        // Echo back so the UI can show "X of Y coins available" without a second call.
        availableCoinBalance: coins.length,
        // Lets the UI render a "Coin grace mode — discount paused" banner.
        memberDiscountActive,
        coinGraceUntil: graceSub?.coinGraceUntil ?? null,
      };
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
        fulfillmentType: z.enum(["pickup", "delivery"]).default("pickup"),
        specialInstructions: z.string().optional(),
        // How many FÜDA Coins to spend on this order (member's choice in the UI).
        // Capped to coins available + eligible cart units. Undefined = use all.
        coinsToApply: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Same access-gate logic as getCheckoutPreview — either active member
      // (full benefits) OR canceled member still in coin grace (coins only).
      const activeSub = await getActiveFudaClubSub(ctx.user.id);
      const graceSub = activeSub ? null : await getCoinGracePeriodSub(ctx.user.id);
      const sub = activeSub ?? graceSub;
      if (!sub || sub.status === "frozen") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No active FÜDA Club subscription." });
      }
      const memberDiscountActive = !!activeSub;

      const coins = await getAvailableCoins(ctx.user.id);
      const coinsToApply = Math.min(
        input.coinsToApply ?? coins.length,
        coins.length
      );

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

      // Pickup = no fee. Delivery = $10, OR free if 5+ active club members at this user's
      // workplace. Stable across the day, doesn't punish the first 4 orderers like the old
      // "5 orders today" rule did.
      const isPickup = input.fulfillmentType === "pickup";
      const [me] = await dbInstance.select({ venueName: users.venueName }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const memberCountAtVenue = await countActiveClubMembersAtVenue(me?.venueName);
      const venueQualifiesForFreeDelivery = memberCountAtVenue >= 5;
      const deliveryFeeInCents = isPickup
        ? 0
        : (venueQualifiesForFreeDelivery ? 0 : 1000);
      const isFreeDelivery = !isPickup && venueQualifiesForFreeDelivery;

      // Compute preview to check the subtotal-after-discount BEFORE enforcing the
      // $15 minimum-order rule for delivery (so member discounts count).
      const preview = calculateClubPricing(cartItems, coinsToApply, deliveryFeeInCents, memberDiscountActive);

      // Minimum order $15 for delivery (after coin + 10% discount applied).
      // Pickup has no minimum — walk-ins are always welcome.
      if (!isPickup && preview.subtotalInCents < MIN_DELIVERY_SUBTOTAL_CENTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Delivery requires a minimum order of $${(MIN_DELIVERY_SUBTOTAL_CENTS / 100).toFixed(2)}. Add more items, or switch to Pickup.`,
        });
      }

      // If total is $0 (all covered by coin, pickup or free delivery), create order directly
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
            // Customer chose pickup → always pickup. Otherwise delivery, downgrading to pickup
            // only if the cutoff has passed (kitchen can't run delivery after 10:30 AM).
            fulfillmentType: (!isPickup && !isPastCutoff) ? "delivery" : "pickup",
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

        // Mark each spent coin as used. preview.coinsApplied may be > 1 if the
        // member chose to spend multiple coins on a bigger order.
        for (let i = 0; i < preview.coinsApplied && i < coins.length; i++) {
          await useFudaCoin(coins[i].id, orderId);
        }

        // Push to Square so the order appears in Square POS / KDS and triggers
        // the printer profile (e.g. "Fuda Lunch") on the connected printer.
        // Fire-and-forget: receipt printing is best-effort, never blocks the order.
        createSquareOrderForPrinting(
          orderId,
          orderNumber,
          preview.items.map(item => {
            const m = menuItemMap.get(item.menuItemId);
            return {
              menuItemId: item.menuItemId,
              itemName: item.name,
              quantity: item.quantity,
              unitPriceInCents: item.discountedPriceInCents,
              variationId: m?.squareVariationId ?? null,
              modifierNote: item.modifierNote ?? null,
            };
          }),
          input.specialInstructions ?? null,
          ctx.user.name ?? null,
          null
        ).then(squareOrderId => {
          if (squareOrderId) {
            printReceiptOnTerminal(orderId, squareOrderId, preview.totalInCents)
              .catch(err => console.error("[Square Terminal] Receipt print failed:", err));
          }
        }).catch(err => console.error("[Square Orders] Push failed for $0 club order:", err));

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
          coins_applied: preview.coinsApplied.toString(),
          // Comma-separated list of the coin IDs that will be marked used after
          // payment. We do NOT mark them used yet — only after Stripe confirms.
          coin_ids: coins.slice(0, preview.coinsApplied).map(c => c.id).join(","),
          coin_id: preview.coinUsed && coins[0] ? coins[0].id.toString() : "",
          order_data: JSON.stringify({
            items: input.items,
            deliveryFee: preview.deliveryFeeInCents,
            tax: 0,
            coinUsed: preview.coinUsed,
            coinsApplied: preview.coinsApplied,
            // Carries grace-mode info so verifyAndCreateOrder applies the same
            // pricing rules (no 10%% off) when finalising the order post-payment.
            memberDiscountActive,
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
  /** True iff at least one coin was applied to this order. Kept for backward compat. */
  coinUsed: boolean;
  /** How many coins this preview actually consumes (capped to eligible units). */
  coinsApplied: number;
  /** How many cart units are eligible for a coin (i.e. non-Mix-Grill units).
   *  The Checkout UI uses this to cap the +/− coin-selector. */
  eligibleUnitsForCoin: number;
  subtotalInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  minDeliveryMet: boolean;
}

/**
 * Calculate FÜDA Club pricing for a cart:
 *
 * Rules (the actual business rules that members see):
 * 1. Mix Grill items are NEVER covered by a FÜDA Coin — they always get 10% off
 *    if the member's discount is active, otherwise full price.
 * 2. Each FÜDA Coin spent covers ONE unit of food, applied to the highest-value
 *    non-Mix-Grill unit currently in the cart (so members get max value per coin).
 * 3. The member chooses how many coins to spend on this order (`coinsToApply`).
 *    If they pass more coins than they have eligible items, the extra coins are
 *    silently capped — coins they don't end up spending stay in their balance.
 * 4. Every non-coin-covered unit gets 10% off ONLY if `memberDiscountActive` is true.
 *    When a member is in the post-cancel coin grace period, they can still REDEEM
 *    coins but no longer get the 10% discount — `memberDiscountActive=false`.
 */
export function calculateClubPricing(
  cartItems: ClubCartItem[],
  coinsToApply: number,
  deliveryFeeInCents: number,
  memberDiscountActive: boolean = true
): ClubCheckoutPreview {
  const DISCOUNT = memberDiscountActive ? 0.10 : 0;
  const MIX_GRILL = FUDA_CLUB.mixGrillCategory.toLowerCase();
  const safeCoinsRequested = Math.max(0, Math.floor(coinsToApply));

  // ── Step 1: Expand cart into individual UNITS (one per qty) ───────────────
  // Each unit gets a stable index so we can later say "this unit is coin-covered".
  type Unit = {
    cartIdx: number;
    menuItemId: number;
    name: string;
    unitPriceInCents: number;
    isMixGrill: boolean;
  };
  const units: Unit[] = [];
  cartItems.forEach((item, cartIdx) => {
    const isMixGrill = item.category.toLowerCase().includes(MIX_GRILL);
    for (let q = 0; q < item.quantity; q++) {
      units.push({
        cartIdx,
        menuItemId: item.menuItemId,
        name: item.name,
        unitPriceInCents: item.unitPriceInCents,
        isMixGrill,
      });
    }
  });

  // ── Step 2: Pick which units the coins cover ──────────────────────────────
  // Eligible = NOT Mix Grill. Sort eligible units by unit price descending so
  // each coin lands on the most expensive eligible unit available.
  const eligibleUnitIndexes = units
    .map((u, idx) => ({ idx, price: u.unitPriceInCents, eligible: !u.isMixGrill }))
    .filter(x => x.eligible)
    .sort((a, b) => b.price - a.price)
    .map(x => x.idx);

  const coinsActuallyApplied = Math.min(safeCoinsRequested, eligibleUnitIndexes.length);
  const coinCoveredUnitSet = new Set<number>(
    eligibleUnitIndexes.slice(0, coinsActuallyApplied)
  );

  // ── Step 3: Compute discounted price for each unit ────────────────────────
  let subtotal = 0;
  const pricedUnits = units.map((u, idx) => {
    const isCoinCovered = coinCoveredUnitSet.has(idx);
    const discounted = isCoinCovered
      ? 0
      : Math.round(u.unitPriceInCents * (1 - DISCOUNT));
    subtotal += discounted;
    return {
      menuItemId: u.menuItemId,
      name: u.name,
      quantity: 1,
      unitPriceInCents: u.unitPriceInCents,
      discountedPriceInCents: discounted,
      isCoinCovered,
      isMixGrill: u.isMixGrill,
      // 10% only counts if the discount was actually active. Coin-grace orders
      // pass DISCOUNT=0, so non-coin units pay full price (no "10% off" badge).
      discount10pct: !isCoinCovered && memberDiscountActive,
    };
  });

  // ── Step 4: Re-group identical units back into line items for display ─────
  // Two units of the same dish at the same price+treatment collapse to qty 2.
  const grouped = new Map<string, typeof pricedUnits[0]>();
  for (const item of pricedUnits) {
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
    coinUsed: coinsActuallyApplied > 0,
    coinsApplied: coinsActuallyApplied,
    eligibleUnitsForCoin: eligibleUnitIndexes.length,
    subtotalInCents: subtotal,
    deliveryFeeInCents: actualDeliveryFee,
    totalInCents: total,
    minDeliveryMet,
  };
}
