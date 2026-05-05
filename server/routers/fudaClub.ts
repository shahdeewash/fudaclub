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
  ltOffers,
  orders as ordersTable,
  orderItems as orderItemsTable,
  menuItems as menuItemsTable,
} from "../../drizzle/schema";
import { eq, and, gt, desc, gte, lte, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { FUDA_CLUB } from "../stripe-products";
import { nanoid } from "nanoid";
import { createSquareOrderForPrinting, printReceiptOnTerminal } from "../square";

// Lazy Stripe init: instantiating at module load with `process.env.STRIPE_SECRET_KEY!`
// crashes the entire server during boot when the env var isn't set (e.g. fresh
// local clone without .env). The Stripe constructor throws on a missing/empty
// key. Defer creation until a route actually needs it so the dev server can boot
// and serve unrelated pages even before Stripe is configured.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add a sk_test_... key to .env for local dev, or set the production key in Railway's Variables tab."
    );
  }
  _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  return _stripe;
}

/**
 * Lazy get-or-create the trial intro coupon.
 * Discounts the FIRST invoice of the trial plan from $180 → $80.
 * Cached in process memory after first use; survives until the server restarts.
 */
let _cachedTrialCouponId: string | null = null;
async function getTrialIntroCouponId(): Promise<string> {
  if (_cachedTrialCouponId) {
    console.log(`[FÜDA Club] Using cached trial coupon: ${_cachedTrialCouponId}`);
    return _cachedTrialCouponId;
  }

  // Try to reuse an existing coupon tagged with metadata.fudaClub = "trial_intro"
  try {
    const existing = await getStripe().coupons.list({ limit: 100 });
    const found = existing.data.find(
      (c) => c.metadata?.fudaClub === "trial_intro" && c.valid && c.amount_off === FUDA_CLUB.trialDiscountCents
    );
    if (found) {
      _cachedTrialCouponId = found.id;
      console.log(`[FÜDA Club] Found existing trial coupon by metadata: ${found.id}`);
      return found.id;
    }
    // Fallback: also search by exact amount + duration "once" (covers manually-created coupons)
    const fallback = existing.data.find(
      (c) => c.valid && c.amount_off === FUDA_CLUB.trialDiscountCents && c.duration === "once" && c.currency?.toLowerCase() === FUDA_CLUB.currency.toLowerCase()
    );
    if (fallback) {
      _cachedTrialCouponId = fallback.id;
      console.log(`[FÜDA Club] Found existing trial coupon by amount+duration: ${fallback.id}`);
      return fallback.id;
    }
    console.log(`[FÜDA Club] No matching trial coupon found in Stripe (searched ${existing.data.length} coupons). Creating new one.`);
  } catch (err: any) {
    console.error(`[FÜDA Club] Error listing Stripe coupons:`, err?.message ?? err);
    // fall through to create
  }

  try {
    const created = await getStripe().coupons.create({
      amount_off: FUDA_CLUB.trialDiscountCents,
      currency: FUDA_CLUB.currency,
      duration: "once",
      name: "FÜDA Club — First fortnight intro",
      metadata: { fudaClub: "trial_intro" },
    });
    _cachedTrialCouponId = created.id;
    console.log(`[FÜDA Club] Created new trial coupon: ${created.id} (-$${FUDA_CLUB.trialDiscountCents / 100} once)`);
    return created.id;
  } catch (err: any) {
    console.error(`[FÜDA Club] FAILED to create trial coupon:`, err?.message ?? err);
    // Re-throw so the subscribe mutation fails loudly instead of silently
    // creating a $180-not-$80 trial checkout.
    throw new Error(`Trial coupon unavailable: ${err?.message ?? "unknown Stripe error"}. Trial signups disabled until fixed.`);
  }
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

/** How long after a row is created we still wait for the Stripe webhook to flip
 *  it to "active"/"trialing". Anything older than this with a null subscriptionId
 *  is treated as an abandoned signup. Stripe Checkout sessions expire after 24h
 *  but real users complete in under a minute; 30 min is a generous safety window. */
const ABANDONED_SIGNUP_GRACE_MS = 30 * 60 * 1000;

/** Check if a user has an active FÜDA Club subscription.
 *  Returns null for any state that should NOT grant member benefits:
 *  - status === "canceled" (immediate-cancel flow set this directly)
 *  - status === "incomplete" (row exists but Stripe never confirmed payment —
 *    either webhook hasn't fired yet, or user abandoned Checkout)
 *  - cancelAtPeriodEnd=true AND currentPeriodEnd has passed (safety net for
 *    when Stripe webhooks haven't fired or weren't wired up — we don't want
 *    a forgotten cancellation to leave a member with eternal free coins)
 *  - stripeSubscriptionId IS NULL AND row is older than ABANDONED_SIGNUP_GRACE_MS
 *    (legacy rows from before the incomplete-status fix; webhook clearly missed)
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
  if (sub.status === "incomplete") return null;
  // Belt-and-braces for legacy rows created before the incomplete-status fix
  // landed: if Stripe never populated the subscriptionId, this signup was never
  // confirmed. Auto-flip the local row to incomplete so it stays out of every
  // other gate (counts, getStatus, ordering preview, food checkout).
  if (!sub.stripeSubscriptionId &&
      sub.createdAt &&
      Date.now() - new Date(sub.createdAt).getTime() > ABANDONED_SIGNUP_GRACE_MS) {
    await db
      .update(fudaClubSubscriptions)
      .set({ status: "incomplete" })
      .where(eq(fudaClubSubscriptions.id, sub.id));
    return null;
  }
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
    r.status !== "frozen" &&
    r.status !== "incomplete"
  ).length;
}

/** Minimum order subtotal (cents) for delivery — protects against $5 deliveries. */
export const MIN_DELIVERY_SUBTOTAL_CENTS = 1500; // $15.00

/** Total spots reserved for founding-50 launch pricing. After this many active subs,
 *  new sign-ups pay the post-launch price (currently +20%). Founders' own price is
 *  locked for 12 months from sign-up. */
export const FOUNDING_MEMBER_CAP = 50;

/** Count active (non-canceled, non-incomplete) FÜDA Club subscriptions across all users.
 *  Used to track founding-50 spots. We exclude "incomplete" so that abandoned
 *  Checkout sessions don't waste founding spots — those become available again
 *  for genuine paid signups. */
export async function countActiveClubSubscriptions(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ status: fudaClubSubscriptions.status })
    .from(fudaClubSubscriptions);
  return rows.filter(r => r.status !== "canceled" && r.status !== "incomplete").length;
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

/**
 * Welcome coin: issued once per subscription, the moment we observe the sub is
 * active AND hasn't received its welcome coin yet. Idempotent — safe to call on
 * every getStatus query. Solves the "I just subscribed at 11 AM, where's my
 * coin?" problem (otherwise members would wait until tomorrow's 6 AM cron).
 *
 * Skips silently on Sundays (no coins issued at all that day) and uses the
 * standard weekly-bucket expiry so the welcome coin behaves identically to a
 * regular daily coin.
 */
export async function issueWelcomeCoinIfNeeded(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [sub] = await db
    .select()
    .from(fudaClubSubscriptions)
    .where(eq(fudaClubSubscriptions.userId, userId))
    .limit(1);
  if (!sub) return false;
  if (sub.hasReceivedWelcomeCoin) return false;
  // Refuse to issue if the sub has been canceled or frozen — same gate as ordering.
  // We allow "incomplete" through to the Stripe-lookup self-heal below: if Stripe
  // confirms the user paid (webhook just hadn't fired yet), the row is patched to
  // active/trialing and the welcome coin issued. Otherwise the lookup returns no
  // active sub and we bail without issuing.
  const eligibleForWelcomeCoin =
    sub.status === "active" || sub.status === "trialing" || sub.status === "incomplete";
  if (!eligibleForWelcomeCoin) return false;
  // ⚠️ Critical payment gate. Stripe is the source of truth for whether money
  // changed hands. The row is created as status='incomplete' and only flipped
  // to active/trialing by the customer.subscription.created webhook AFTER
  // Stripe captures a payment method. So the presence of stripeSubscriptionId
  // (or, equivalently, a non-null status that's already active/trialing) is
  // proof of payment.
  //
  // Backfill: if stripeSubscriptionId is still null but we have a stripeCustomerId
  // AND Stripe shows an active sub on that customer, the webhook clearly
  // missed an event — self-heal by patching the row, then proceed. If Stripe
  // shows no active sub, this is an abandoned signup and we MUST NOT issue
  // a coin.
  if (!sub.stripeSubscriptionId) {
    if (!sub.stripeCustomerId) {
      console.log(`[FÜDA Club] Skipping welcome coin for user ${userId} — no Stripe customer yet`);
      return false;
    }
    try {
      const subs = await getStripe().subscriptions.list({ customer: sub.stripeCustomerId, limit: 1 });
      const stripeActive = subs.data.find(s => s.status === "active" || s.status === "trialing");
      if (!stripeActive) {
        console.log(`[FÜDA Club] Skipping welcome coin for user ${userId} — no active Stripe sub on customer ${sub.stripeCustomerId}`);
        return false;
      }
      // Patch our row — webhook clearly missed the subscription.created event.
      await db
        .update(fudaClubSubscriptions)
        .set({
          stripeSubscriptionId: stripeActive.id,
          status: stripeActive.status as any,
          currentPeriodEnd: stripeActive.current_period_end
            ? new Date(stripeActive.current_period_end * 1000)
            : null,
        })
        .where(eq(fudaClubSubscriptions.id, sub.id));
      console.log(`[FÜDA Club] Backfilled stripeSubscriptionId=${stripeActive.id} for user ${userId} from Stripe API. Welcome coin will proceed.`);
      sub.stripeSubscriptionId = stripeActive.id;
    } catch (err: any) {
      console.error(`[FÜDA Club] Stripe lookup failed during welcome-coin backfill for user ${userId}:`, err?.message ?? err);
      return false;
    }
  }
  // Compute the same end-of-week (next Monday 00:00 Darwin) expiry used by the
  // daily cron, so the welcome coin lives or dies with that week's bucket.
  const dayOfWeek = new Date().toLocaleDateString("en-US", { timeZone: "Australia/Darwin", weekday: "short" });
  if (dayOfWeek === "Sun") {
    // No issuance Sundays — but still flip the flag so we don't loop forever.
    // The next subsequent cron run on Monday will issue them their day-1 coin.
    await db
      .update(fudaClubSubscriptions)
      .set({ hasReceivedWelcomeCoin: true })
      .where(eq(fudaClubSubscriptions.id, sub.id));
    return false;
  }
  const daysToNextMonday: Record<string, number> = {
    Mon: 7, Tue: 6, Wed: 5, Thu: 4, Fri: 3, Sat: 2, Sun: 1,
  };
  const nowDarwin = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
  const [y, m, d] = nowDarwin.split("-").map(Number);
  const daysAhead = daysToNextMonday[dayOfWeek] ?? 7;
  const expiresAt = new Date(Date.UTC(y, m - 1, d + daysAhead, 14, 30, 0));
  await issueFudaCoin(userId, "daily", expiresAt);
  await db
    .update(fudaClubSubscriptions)
    .set({ hasReceivedWelcomeCoin: true })
    .where(eq(fudaClubSubscriptions.id, sub.id));
  console.log(`[FÜDA Club] Welcome coin issued to user ${userId} (expires ${expiresAt.toISOString()})`);
  return true;
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

  /**
   * Public — list active LTO banners (now/upcoming).
   * /menu and the homepage call this; returns ones where startsAt <= now <= endsAt
   * AND isActive=true. Returns soonest-ending first so the most urgent banner shows.
   */
  getActiveLtOffers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const now = new Date();
    const rows = await db.select().from(ltOffers).where(eq(ltOffers.isActive, true));
    return rows
      .filter(o => o.startsAt <= now && o.endsAt >= now)
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  }),

  /**
   * Member's most recent order — used by the in-app "your order is being prepared"
   * polling notification system. Returns null if no recent order in the last 4 hours.
   */
  getMyLatestOrder: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const [latest] = await db
      .select()
      .from(ordersTable)
      .where(and(
        eq(ordersTable.userId, ctx.user.id),
        gte(ordersTable.orderDate, cutoff),
      ))
      .orderBy(desc(ordersTable.orderDate))
      .limit(1);
    if (!latest) return null;
    const items = await db
      .select({ itemName: orderItemsTable.itemName, quantity: orderItemsTable.quantity })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, latest.id));
    return { ...latest, items };
  }),

  /** Member's order history (for Profile page reorder buttons) */
  getMyOrderHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit ?? 20;
      const rows = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.userId, ctx.user.id))
        .orderBy(desc(ordersTable.orderDate))
        .limit(limit);
      const orderIds = rows.map(o => o.id);
      let itemsByOrder = new Map<number, Array<{ menuItemId: number; itemName: string; quantity: number }>>();
      if (orderIds.length > 0) {
        const items = await db
          .select({
            orderId: orderItemsTable.orderId,
            menuItemId: orderItemsTable.menuItemId,
            itemName: orderItemsTable.itemName,
            quantity: orderItemsTable.quantity,
          })
          .from(orderItemsTable)
          .where(inArray(orderItemsTable.orderId, orderIds));
        for (const it of items) {
          const arr = itemsByOrder.get(it.orderId) ?? [];
          arr.push({ menuItemId: it.menuItemId, itemName: it.itemName, quantity: it.quantity });
          itemsByOrder.set(it.orderId, arr);
        }
      }
      return rows.map(o => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));
    }),

  /**
   * Reorder — given a past orderId, return the cart items needed to recreate
   * that order. Frontend takes this and dumps it into localStorage as the new
   * cart, then routes the user to /checkout. Skips items whose menuItemId no
   * longer exists in the catalogue (sold out / removed).
   */
  reorder: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify the order belongs to this user
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.id, input.orderId), eq(ordersTable.userId, ctx.user.id)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      // Pull items + their current menu rows (price may have changed)
      const items = await db
        .select({
          menuItemId: orderItemsTable.menuItemId,
          quantity: orderItemsTable.quantity,
          modifierNote: orderItemsTable.modifierNote,
        })
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, input.orderId));
      const menuIds = items.map(i => i.menuItemId);
      if (menuIds.length === 0) return { items: [], skipped: 0 };
      const menuRows = await db
        .select()
        .from(menuItemsTable)
        .where(inArray(menuItemsTable.id, menuIds));
      const menuMap = new Map(menuRows.map(m => [m.id, m]));
      // Aggregate quantities for the same menuItemId (in case of split rows
      // from coin-cover free + paid units).
      const aggMap = new Map<number, { menuItemId: number; quantity: number; modifierNote?: string }>();
      let skipped = 0;
      for (const it of items) {
        const m = menuMap.get(it.menuItemId);
        if (!m) { skipped += 1; continue; }
        const existing = aggMap.get(it.menuItemId);
        if (existing) {
          existing.quantity += it.quantity;
        } else {
          aggMap.set(it.menuItemId, {
            menuItemId: it.menuItemId,
            quantity: it.quantity,
            modifierNote: it.modifierNote ?? undefined,
          });
        }
      }
      // Return cart shape ready for localStorage write client-side
      const cartItems = Array.from(aggMap.values()).map(it => {
        const m = menuMap.get(it.menuItemId)!;
        return {
          id: it.menuItemId,
          name: m.name,
          price: m.price,
          quantity: it.quantity,
          imageUrl: m.imageUrl ?? undefined,
          modifierNote: it.modifierNote,
        };
      });
      return { items: cartItems, skipped };
    }),

  /**
   * Onboarding nudge — returns the most relevant in-app message based on the
   * member's subscription age + plan. Frontend renders as a dismissible banner.
   * No nudge → returns null.
   */
  getOnboardingNudge: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const sub = await getActiveFudaClubSub(ctx.user.id);
    if (!sub) return null;
    const ageMs = Date.now() - new Date(sub.createdAt).getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const coins = await getAvailableCoins(ctx.user.id);
    if (ageDays === 0) {
      return {
        key: "welcome",
        title: "Welcome to FÜDA Club 🎉",
        body: coins.length > 0
          ? `Your first FÜDA Coin is ready — order any item and we'll cover it.`
          : `Your first coin lands tomorrow morning at 6 AM.`,
      };
    }
    if (sub.planType === "trial" && ageDays >= 5 && ageDays <= 6) {
      return {
        key: "trial_ending",
        title: "Trial ends in 1–2 days",
        body: `After your trial wraps, you'll auto-roll into the fortnightly plan ($180/14 days). Cancel from your Profile if it's not for you — no hard feelings.`,
      };
    }
    if (sub.planType === "trial" && ageDays === 7) {
      return {
        key: "trial_ends_today",
        title: "Trial ends today",
        body: `Tomorrow you'll be on the fortnightly plan unless you cancel. Loving the club? You're already locked in.`,
      };
    }
    if (ageDays === 1 && coins.length > 0) {
      return {
        key: "use_your_coin",
        title: "Don't forget — your FÜDA Coin is valid",
        body: `Order anything (except Mix Grill) and your coin covers your highest-value item.`,
      };
    }
    return null;
  }),

  /** Get current user's FÜDA Club status, coin balance, and venue */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    const sub = await getActiveFudaClubSub(userId);
    // Self-healing welcome-coin issuance — if member is freshly active and
    // hasn't received their welcome coin yet, issue it now (instead of making
    // them wait until tomorrow's 6 AM cron). No-op if already issued or sub
    // is in any other state.
    if (sub) {
      await issueWelcomeCoinIfNeeded(userId).catch(err =>
        console.error("[FÜDA Club] Welcome coin issue failed (non-blocking):", err)
      );
    }
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
      const customer = await getStripe().customers.create({
        email: userData?.email ?? undefined,
        name: userData?.name ?? undefined,
        metadata: { userId: userId.toString() },
      });

      // ── Plan-specific config ───────────────────────────────────────────────
      const planType = input.planType;

      let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
      // Trial-specific: free 7-day trial on the recurring sub. The $80 trial-access
      // fee is added as a second one-time line_item (Checkout combines recurring +
      // one-time line_items on the first invoice). `add_invoice_items` is NOT a
      // valid field under `subscription_data` on Checkout Sessions — Stripe rejects
      // it with "received unknown parameter". For non-trial plans this stays undefined.
      let trialPeriodDays: number | undefined;

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
      } else {
        // planType === "trial"
        // NEW MODEL (replaces the previous "$100 off first fortnight" coupon):
        //   Day 1: charge $80 (one-time invoice item) for 7 days of trial access
        //   Day 8: $180 fortnightly subscription kicks in (Stripe's trial_period_days)
        //   Day 22: $180 again, every 14 days thereafter
        // No "discount" framing — it's a 7-day-trial price + a separate fortnightly product.
        lineItems = [
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club — Fortnightly Membership",
                description: "Begins on day 8 · Mon–Sat · 1 FÜDA Coin/day · 10% off every order",
              },
              recurring: {
                interval: FUDA_CLUB.interval,
                interval_count: FUDA_CLUB.intervalCount,
              },
              unit_amount: FUDA_CLUB.recurringPriceCents,
            },
            quantity: 1,
          },
          // One-time $80 trial-access fee. Mixed line_items (recurring + one-time)
          // are supported in subscription-mode Checkout — both land on the first
          // invoice; the recurring portion is $0 because of the 7-day trial below.
          {
            price_data: {
              currency: FUDA_CLUB.currency,
              product_data: {
                name: "The FÜDA Club — 7-Day Trial Access",
              },
              unit_amount: FUDA_CLUB.introPriceCents, // $80
            },
            quantity: 1,
          },
        ];
        // 7-day FREE trial on the recurring sub (so first $180 is on day 8 not day 1)
        trialPeriodDays = 7;
      }

      const session = await getStripe().checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: lineItems,
        // Members can paste promo codes on non-trial plans. Trial uses native
        // Stripe trial structure now (no coupon), so promo codes are still allowed.
        allow_promotion_codes: true,
        subscription_data: {
          ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
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

      // Store pending subscription record. We deliberately set status="incomplete"
      // here — the row should NOT grant Club benefits until Stripe confirms payment.
      // The `customer.subscription.created` webhook is what flips this to
      // "active" / "trialing" once a payment method is captured (and, for non-trial,
      // the first charge succeeds). Without this gate, abandoned signups would
      // get welcome coins, daily coins, and member discounts for free.
      if (db) {
        await db
          .insert(fudaClubSubscriptions)
          .values({
            userId,
            stripeCustomerId: customer.id,
            status: "incomplete",
            introUsed: false,
            cancelAtPeriodEnd: false,
            planType,
            isFoundingMember,
            lockedPriceUntil,
            // Reset welcome-coin flag on every fresh signup attempt so a new paid
            // signup after a previously-abandoned one still gets its welcome coin.
            hasReceivedWelcomeCoin: false,
            // Clear stripeSubscriptionId from any prior abandoned attempt — the
            // webhook will repopulate it on subscription.created.
            stripeSubscriptionId: null,
          })
          .onDuplicateKeyUpdate({
            set: {
              stripeCustomerId: customer.id,
              status: "incomplete",
              planType,
              hasReceivedWelcomeCoin: false,
              stripeSubscriptionId: null,
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
        await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
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
          coinEligible: m.coinEligible,
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
        // Optional schedule-ahead pickup/delivery time (ISO datetime). Null = ASAP.
        scheduledFor: z.string().optional(),
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
          coinEligible: m.coinEligible,
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
            scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
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

      const session = await getStripe().checkout.sessions.create({
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
            scheduledFor: input.scheduledFor ?? null,
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
  /**
   * Per-item flag mirrored from menuItems.coinEligible. If undefined (legacy
   * caller), we fall back to category-list + name-pattern match against
   * FUDA_CLUB.coinIneligibleCategories / coinIneligibleNamePatterns.
   */
  coinEligible?: boolean;
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
  // Per-item flag wins. If undefined (legacy callers / unmigrated data),
  // we fall back to: (a) category match against coinIneligibleCategories,
  // OR (b) name match against coinIneligibleNamePatterns (catches Mix Grill
  // which sits inside Kebab Mains category, not a category of its own).
  const INELIGIBLE_CATS = new Set(
    FUDA_CLUB.coinIneligibleCategories.map(c => c.toLowerCase().trim())
  );
  const INELIGIBLE_NAME_PATTERNS = FUDA_CLUB.coinIneligibleNamePatterns.map(
    p => p.toLowerCase()
  );
  const isIneligibleByFallback = (item: ClubCartItem): boolean => {
    const cat = (item.category ?? "").toLowerCase().trim();
    if (INELIGIBLE_CATS.has(cat)) return true;
    const nm = (item.name ?? "").toLowerCase();
    return INELIGIBLE_NAME_PATTERNS.some(p => nm.includes(p));
  };
  const safeCoinsRequested = Math.max(0, Math.floor(coinsToApply));

  // ── Step 1: Expand cart into individual UNITS (one per qty) ───────────────
  // Each unit gets a stable index so we can later say "this unit is coin-covered".
  type Unit = {
    cartIdx: number;
    menuItemId: number;
    name: string;
    unitPriceInCents: number;
    isMixGrill: boolean; // semantic: "true = coin can't apply" (kept name for back-compat)
  };
  const units: Unit[] = [];
  cartItems.forEach((item, cartIdx) => {
    // Per-item flag wins; fallback to category/name match.
    const isIneligible =
      item.coinEligible === false ||
      (item.coinEligible === undefined && isIneligibleByFallback(item));
    for (let q = 0; q < item.quantity; q++) {
      units.push({
        cartIdx,
        menuItemId: item.menuItemId,
        name: item.name,
        unitPriceInCents: item.unitPriceInCents,
        isMixGrill: isIneligible,
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
