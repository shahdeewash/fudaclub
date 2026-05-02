/**
 * Admin operations dashboard router.
 *
 * All endpoints are admin-only — they throw FORBIDDEN if the caller's role
 * isn't "admin". Surfaces the operational data Deewash needs day-to-day:
 * live orders, member management, refunds, manual coin adjustments, workplace
 * clusters, MRR/churn, coin economy, CSV exports, and member notes.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  users,
  fudaClubSubscriptions,
  fudaCoins,
  orders,
  orderItems,
  ltOffers,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { issueFudaCoin, useFudaCoin } from "./fudaClub";

// Lazy Stripe init: see fudaClub.ts for rationale. Instantiating at module load
// with `STRIPE_SECRET_KEY!` crashes the server at boot when the env var isn't
// set (e.g. fresh local clone). Defer until a route actually uses it.
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

/** Throw FORBIDDEN unless the caller is an admin. */
function requireAdmin(ctx: { user: { role?: string | null } }) {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only." });
  }
}

/** Darwin midnight as UTC Date. */
function darwinStartOfToday(): Date {
  const now = new Date();
  // Darwin = UTC+9:30 — get YYYY-MM-DD in Darwin tz.
  const darwinDate = now.toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
  const [y, m, d] = darwinDate.split("-").map(Number);
  // 00:00 Darwin = 14:30 UTC previous day
  return new Date(Date.UTC(y, m - 1, d - 1, 14, 30, 0));
}

export const adminRouter = router({
  /**
   * Today-at-a-glance widget data + MRR + coin economy in one call so the
   * dashboard doesn't fan out into 5 separate queries on load.
   */
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const todayStart = darwinStartOfToday();

    // Today's orders + revenue
    const todaysOrders = await db
      .select({ id: orders.id, total: orders.total })
      .from(orders)
      .where(gte(orders.orderDate, todayStart));
    const ordersToday = todaysOrders.length;
    const revenueTodayCents = todaysOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

    // Active club members (status not canceled)
    const allSubs = await db
      .select({
        id: fudaClubSubscriptions.id,
        status: fudaClubSubscriptions.status,
        planType: fudaClubSubscriptions.planType,
      })
      .from(fudaClubSubscriptions);
    const activeSubs = allSubs.filter(s => s.status !== "canceled");
    const activeMembers = activeSubs.length;
    const canceledMembers = allSubs.filter(s => s.status === "canceled").length;
    const totalEverSubs = allSubs.length;
    const churnRate = totalEverSubs > 0 ? canceledMembers / totalEverSubs : 0;

    // MRR estimate — sum of monthly equivalent of every active sub
    let mrrCents = 0;
    for (const s of activeSubs) {
      if (s.planType === "trial" || s.planType === "fortnightly") {
        mrrCents += Math.round(18000 * (52 / 12) / 26 * 26 / 12); // ~$390/mo from fortnightly
      } else if (s.planType === "monthly") {
        mrrCents += 35000;
      }
    }
    // Simpler: $180/14d × 30/14 ≈ $385.71 for fortnightly, $350 for monthly
    mrrCents = activeSubs.reduce((sum, s) => {
      if (s.planType === "trial") return sum + 8000;            // $80 trial
      if (s.planType === "fortnightly") return sum + 38571;     // ~$385.71/mo equivalent
      if (s.planType === "monthly") return sum + 35000;         // $350/mo
      return sum;
    }, 0);

    // Coin economy — issued vs redeemed (lifetime)
    const allCoins = await db.select({ isUsed: fudaCoins.isUsed }).from(fudaCoins);
    const coinsIssued = allCoins.length;
    const coinsRedeemed = allCoins.filter(c => c.isUsed).length;
    const coinRedemptionRate = coinsIssued > 0 ? coinsRedeemed / coinsIssued : 0;

    // Top 5 menu items today (by quantity)
    const todaysOrderIds = todaysOrders.map(o => o.id);
    let topItems: Array<{ name: string; qty: number; revenueCents: number }> = [];
    if (todaysOrderIds.length > 0) {
      const items = await db
        .select({
          itemName: orderItems.itemName,
          quantity: orderItems.quantity,
          totalPrice: orderItems.totalPrice,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, todaysOrderIds));
      const map = new Map<string, { qty: number; revenueCents: number }>();
      for (const i of items) {
        const existing = map.get(i.itemName) ?? { qty: 0, revenueCents: 0 };
        existing.qty += i.quantity;
        existing.revenueCents += i.totalPrice;
        map.set(i.itemName, existing);
      }
      topItems = Array.from(map.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
    }

    return {
      ordersToday,
      revenueTodayCents,
      activeMembers,
      canceledMembers,
      totalEverSubs,
      churnRate,
      mrrCents,
      coinsIssued,
      coinsRedeemed,
      coinRedemptionRate,
      topItems,
    };
  }),

  /**
   * Live orders feed — most recent N orders with member, items, status.
   * Used by the Orders tab. Polled every 15s on the frontend so new orders
   * surface without a manual refresh.
   */
  listLiveOrders: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) return [];

      const recent = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          orderDate: orders.orderDate,
          status: orders.status,
          fulfillmentType: orders.fulfillmentType,
          subtotal: orders.subtotal,
          deliveryFee: orders.deliveryFee,
          tax: orders.tax,
          total: orders.total,
          specialInstructions: orders.specialInstructions,
          stripeSessionId: orders.stripeSessionId,
          squareOrderId: orders.squareOrderId,
          userId: orders.userId,
          customerName: users.name,
          customerEmail: users.email,
          customerVenueName: users.venueName,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .orderBy(desc(orders.orderDate))
        .limit(input.limit);

      // Pull line items for each order in one query, then group.
      const orderIds = recent.map(o => o.id);
      let itemsByOrder = new Map<number, Array<{ itemName: string; quantity: number; totalPrice: number; isFree: boolean }>>();
      if (orderIds.length > 0) {
        const items = await db
          .select({
            orderId: orderItems.orderId,
            itemName: orderItems.itemName,
            quantity: orderItems.quantity,
            totalPrice: orderItems.totalPrice,
            isFree: orderItems.isFree,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds));
        for (const it of items) {
          const arr = itemsByOrder.get(it.orderId) ?? [];
          arr.push({
            itemName: it.itemName,
            quantity: it.quantity,
            totalPrice: it.totalPrice,
            isFree: it.isFree ?? false,
          });
          itemsByOrder.set(it.orderId, arr);
        }
      }

      return recent.map(o => ({
        ...o,
        items: itemsByOrder.get(o.id) ?? [],
      }));
    }),

  /**
   * Members list with optional search (by name, email, or venue) and pagination.
   * Returns lightweight rows for the table; click a row → getMember for detail.
   */
  listMembers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) return { members: [], total: 0 };

      // Pull all club-subscribed users + their sub status. Filter in JS so
      // we don't need to fight MySQL collation for case-insensitive matching.
      const rows = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          venueName: users.venueName,
          referralCode: users.referralCode,
          adminNote: users.adminNote,
          createdAt: users.createdAt,
          subId: fudaClubSubscriptions.id,
          subStatus: fudaClubSubscriptions.status,
          planType: fudaClubSubscriptions.planType,
          isFoundingMember: fudaClubSubscriptions.isFoundingMember,
          cancelAtPeriodEnd: fudaClubSubscriptions.cancelAtPeriodEnd,
          currentPeriodEnd: fudaClubSubscriptions.currentPeriodEnd,
          coinGraceUntil: fudaClubSubscriptions.coinGraceUntil,
        })
        .from(fudaClubSubscriptions)
        .innerJoin(users, eq(fudaClubSubscriptions.userId, users.id))
        .orderBy(desc(fudaClubSubscriptions.createdAt));

      const search = input.search?.trim().toLowerCase() ?? "";
      const filtered = search
        ? rows.filter(r =>
            (r.name ?? "").toLowerCase().includes(search) ||
            (r.email ?? "").toLowerCase().includes(search) ||
            (r.venueName ?? "").toLowerCase().includes(search)
          )
        : rows;

      const total = filtered.length;
      const page = filtered.slice(input.offset, input.offset + input.limit);

      return { members: page, total };
    }),

  /** Single member detail — sub, coins, orders, lifetime spend. */
  getMember: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const [sub] = await db
        .select()
        .from(fudaClubSubscriptions)
        .where(eq(fudaClubSubscriptions.userId, input.userId))
        .limit(1);

      const userCoins = await db
        .select()
        .from(fudaCoins)
        .where(eq(fudaCoins.userId, input.userId))
        .orderBy(desc(fudaCoins.issuedAt))
        .limit(50);

      const userOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          orderDate: orders.orderDate,
          total: orders.total,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.userId, input.userId))
        .orderBy(desc(orders.orderDate))
        .limit(20);

      const lifetimeSpendCents = userOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

      return {
        user,
        subscription: sub ?? null,
        coins: userCoins,
        orders: userOrders,
        lifetimeSpendCents,
        availableCoins: userCoins.filter(c => !c.isUsed && c.expiresAt > new Date()).length,
      };
    }),

  /**
   * Manually issue or revoke a FÜDA Coin for a member.
   * Reason logged in coin row for audit (uses the existing "admin" reason enum).
   */
  adjustMemberCoins: protectedProcedure
    .input(
      z.object({
        userId: z.number().int(),
        delta: z.number().int(),  // +N to issue, -N to revoke
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.delta > 0) {
        // Issue N coins, expiring midnight Sunday Darwin (same weekly bucket rule)
        const dayOfWeek = new Date().toLocaleDateString("en-US", { timeZone: "Australia/Darwin", weekday: "short" });
        const daysToNextMonday: Record<string, number> = {
          Mon: 7, Tue: 6, Wed: 5, Thu: 4, Fri: 3, Sat: 2, Sun: 1,
        };
        const nowDarwin = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
        const [y, m, d] = nowDarwin.split("-").map(Number);
        const daysAhead = daysToNextMonday[dayOfWeek] ?? 7;
        const expiresAt = new Date(Date.UTC(y, m - 1, d + daysAhead, 14, 30, 0));
        for (let i = 0; i < input.delta; i++) {
          await issueFudaCoin(input.userId, "admin", expiresAt);
        }
        return { issued: input.delta, revoked: 0 };
      } else if (input.delta < 0) {
        // Revoke N unused, unexpired coins (oldest first)
        const toRevoke = Math.abs(input.delta);
        const available = await db
          .select({ id: fudaCoins.id })
          .from(fudaCoins)
          .where(and(
            eq(fudaCoins.userId, input.userId),
            eq(fudaCoins.isUsed, false),
            gte(fudaCoins.expiresAt, new Date()),
          ))
          .orderBy(fudaCoins.issuedAt)
          .limit(toRevoke);
        for (const c of available) {
          await db
            .update(fudaCoins)
            .set({ isUsed: true, usedAt: new Date() })
            .where(eq(fudaCoins.id, c.id));
        }
        return { issued: 0, revoked: available.length };
      }
      return { issued: 0, revoked: 0 };
    }),

  /**
   * Refund a Stripe charge for an order. Marks the local order as canceled.
   * Doesn't refund the FÜDA Coin used (member already got the value).
   */
  refundOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (!order.stripeSessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe payment to refund (free order or external payment).",
        });
      }
      try {
        // Pull the payment intent from the session, refund it
        const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
        if (!paymentIntentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe session has no payment intent." });
        }
        await getStripe().refunds.create({ payment_intent: paymentIntentId });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Stripe refund failed: ${err?.message ?? "unknown error"}`,
        });
      }
      await db
        .update(orders)
        .set({ status: "cancelled" as any })
        .where(eq(orders.id, input.orderId));
      return { success: true };
    }),

  /**
   * Cancel a member's subscription on their behalf (phone/email request).
   * Same logic as the member's own cancel button — discount stops immediately,
   * coin grace until end of paid period.
   */
  cancelMemberSub: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db
        .select()
        .from(fudaClubSubscriptions)
        .where(eq(fudaClubSubscriptions.userId, input.userId))
        .limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "No subscription found" });
      if (sub.status === "canceled") {
        return { success: true, alreadyCanceled: true };
      }
      if (sub.stripeSubscriptionId) {
        try {
          await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
        } catch (err: any) {
          console.error("[Admin] Stripe cancel_at_period_end failed:", err?.message ?? err);
        }
      }
      const coinGraceUntil = sub.currentPeriodEnd
        ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await db
        .update(fudaClubSubscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          coinGraceUntil,
        })
        .where(eq(fudaClubSubscriptions.id, sub.id));
      return { success: true, coinGraceUntil: coinGraceUntil.toISOString() };
    }),

  /** Update the admin-only note on a member. */
  updateMemberNote: protectedProcedure
    .input(z.object({ userId: z.number().int(), note: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(users)
        .set({ adminNote: input.note })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  /**
   * Workplace clusters — every venue with at least one active member, sorted
   * by member count descending. Highlights venues close to the 5+ free-delivery
   * threshold so admin can target them with sales outreach.
   */
  listWorkplaceClusters: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        venueName: users.venueName,
        userId: users.id,
        status: fudaClubSubscriptions.status,
      })
      .from(fudaClubSubscriptions)
      .innerJoin(users, eq(fudaClubSubscriptions.userId, users.id));

    const clusters = new Map<string, { count: number; canceledCount: number }>();
    for (const r of rows) {
      const key = r.venueName?.trim() || "(no venue set)";
      const c = clusters.get(key) ?? { count: 0, canceledCount: 0 };
      if (r.status === "canceled") c.canceledCount += 1;
      else c.count += 1;
      clusters.set(key, c);
    }
    return Array.from(clusters.entries())
      .map(([venueName, { count, canceledCount }]) => ({
        venueName,
        activeCount: count,
        canceledCount,
        qualifiesForFreeDelivery: count >= 5,
        oneAwayFromFree: count === 4,
      }))
      .sort((a, b) => b.activeCount - a.activeCount);
  }),

  /**
   * CSV export for orders or members. Returns a CSV string the frontend can
   * trigger as a download via a Blob URL.
   */
  exportCsv: protectedProcedure
    .input(z.object({ kind: z.enum(["orders", "members"]) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) return { csv: "", filename: "empty.csv" };

      if (input.kind === "orders") {
        const rows = await db
          .select({
            orderNumber: orders.orderNumber,
            orderDate: orders.orderDate,
            status: orders.status,
            fulfillmentType: orders.fulfillmentType,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            tax: orders.tax,
            total: orders.total,
            customerName: users.name,
            customerEmail: users.email,
            customerVenueName: users.venueName,
          })
          .from(orders)
          .leftJoin(users, eq(orders.userId, users.id))
          .orderBy(desc(orders.orderDate))
          .limit(5000);
        const header = "Order Number,Date,Status,Fulfillment,Subtotal,Delivery Fee,Tax,Total,Customer,Email,Venue";
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return s.includes(",") || s.includes("\"") || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        };
        const lines = rows.map(r => [
          r.orderNumber,
          r.orderDate?.toISOString() ?? "",
          r.status,
          r.fulfillmentType,
          (r.subtotal / 100).toFixed(2),
          ((r.deliveryFee ?? 0) / 100).toFixed(2),
          ((r.tax ?? 0) / 100).toFixed(2),
          ((r.total ?? 0) / 100).toFixed(2),
          r.customerName ?? "",
          r.customerEmail ?? "",
          r.customerVenueName ?? "",
        ].map(escape).join(","));
        return {
          csv: [header, ...lines].join("\n"),
          filename: `fuda-orders-${new Date().toISOString().slice(0, 10)}.csv`,
        };
      } else {
        const rows = await db
          .select({
            name: users.name,
            email: users.email,
            venueName: users.venueName,
            adminNote: users.adminNote,
            createdAt: users.createdAt,
            subStatus: fudaClubSubscriptions.status,
            planType: fudaClubSubscriptions.planType,
            isFoundingMember: fudaClubSubscriptions.isFoundingMember,
          })
          .from(fudaClubSubscriptions)
          .innerJoin(users, eq(fudaClubSubscriptions.userId, users.id))
          .orderBy(desc(fudaClubSubscriptions.createdAt));
        const header = "Name,Email,Venue,Plan,Status,Founding Member,Joined,Note";
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return s.includes(",") || s.includes("\"") || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        };
        const lines = rows.map(r => [
          r.name ?? "",
          r.email ?? "",
          r.venueName ?? "",
          r.planType,
          r.subStatus,
          r.isFoundingMember ? "Yes" : "No",
          r.createdAt?.toISOString() ?? "",
          r.adminNote ?? "",
        ].map(escape).join(","));
        return {
          csv: [header, ...lines].join("\n"),
          filename: `fuda-members-${new Date().toISOString().slice(0, 10)}.csv`,
        };
      }
    }),

  /**
   * Update an order's status (admin marks New → Preparing → Ready → Picked up).
   * The member's order-tracking page polls and shows the new status live.
   */
  updateOrderStatus: protectedProcedure
    .input(z.object({
      orderId: z.number().int(),
      status: z.enum(["pending", "confirmed", "preparing", "ready", "delivered", "canceled"]),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(orders).set({ status: input.status as any }).where(eq(orders.id, input.orderId));
      return { success: true };
    }),

  /**
   * Daily prep forecast — predicts tomorrow's expected order volume based on
   * active member count + last-7-days same-weekday average. Minimal viable;
   * gets smarter as we accumulate more data.
   */
  getPrepForecast: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allActiveSubs = await db
      .select({ id: fudaClubSubscriptions.id })
      .from(fudaClubSubscriptions)
      .where(and(
        // not canceled
        sql`${fudaClubSubscriptions.status} != 'canceled'`,
      ));
    const activeMembers = allActiveSubs.length;

    // Last 28 days of orders, group by weekday
    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const recentOrders = await db
      .select({ orderDate: orders.orderDate })
      .from(orders)
      .where(gte(orders.orderDate, since));

    const ordersPerWeekday = new Map<number, number>();
    const daysPerWeekday = new Map<number, Set<string>>();
    for (const o of recentOrders) {
      if (!o.orderDate) continue;
      const dow = o.orderDate.getDay();
      ordersPerWeekday.set(dow, (ordersPerWeekday.get(dow) ?? 0) + 1);
      const ds = daysPerWeekday.get(dow) ?? new Set<string>();
      ds.add(o.orderDate.toISOString().slice(0, 10));
      daysPerWeekday.set(dow, ds);
    }

    // Predict tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomDow = tomorrow.getDay();
    const tomTotal = ordersPerWeekday.get(tomDow) ?? 0;
    const tomDays = daysPerWeekday.get(tomDow)?.size ?? 0;
    const avgOrdersForThatDow = tomDays > 0 ? Math.round(tomTotal / tomDays) : 0;

    // Projected = avg of (historical avg) and (members × 0.4 expected daily order rate)
    const memberBased = Math.round(activeMembers * 0.4);
    const projected = Math.max(avgOrdersForThatDow, memberBased);

    return {
      activeMembers,
      tomorrowDayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][tomDow],
      historicalAvgOrdersThisWeekday: avgOrdersForThatDow,
      memberBasedEstimate: memberBased,
      projectedOrdersTomorrow: projected,
      sampleSize: tomDays,
    };
  }),

  /**
   * Referral leaderboard — top N members by # of successful referrals.
   * "Successful" = the referred user has an active sub.
   */
  getReferralLeaderboard: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) return [];
      const referredUsers = await db
        .select({
          referredId: users.id,
          referrerId: users.referredBy,
          referrerName: sql<string>`(SELECT name FROM users WHERE id = ${users.referredBy})`,
          referrerEmail: sql<string>`(SELECT email FROM users WHERE id = ${users.referredBy})`,
          subStatus: fudaClubSubscriptions.status,
        })
        .from(users)
        .leftJoin(fudaClubSubscriptions, eq(fudaClubSubscriptions.userId, users.id))
        .where(sql`${users.referredBy} IS NOT NULL`);

      const counts = new Map<number, { name: string; email: string; total: number; active: number }>();
      for (const r of referredUsers) {
        if (!r.referrerId) continue;
        const c = counts.get(r.referrerId) ?? { name: r.referrerName ?? "Anonymous", email: r.referrerEmail ?? "", total: 0, active: 0 };
        c.total += 1;
        if (r.subStatus && r.subStatus !== "canceled") c.active += 1;
        counts.set(r.referrerId, c);
      }
      return Array.from(counts.entries())
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.active - a.active || b.total - a.total)
        .slice(0, input.limit);
    }),

  // ─── LTO offers (limited-time offer banners) ─────────────────────────────

  listLtOffers: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(ltOffers).orderBy(desc(ltOffers.createdAt));
  }),

  createLtOffer: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      body: z.string().min(1),
      ctaText: z.string().max(120).optional(),
      ctaUrl: z.string().max(500).optional(),
      startsAt: z.string(),  // ISO date string
      endsAt: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const inserted = await db.insert(ltOffers).values({
        title: input.title,
        body: input.body,
        ctaText: input.ctaText,
        ctaUrl: input.ctaUrl,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        isActive: true,
      });
      return { success: true, id: (inserted as any).insertId };
    }),

  updateLtOffer: protectedProcedure
    .input(z.object({ id: z.number().int(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const set: any = {};
      if (input.isActive !== undefined) set.isActive = input.isActive;
      await db.update(ltOffers).set(set).where(eq(ltOffers.id, input.id));
      return { success: true };
    }),

  deleteLtOffer: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(ltOffers).where(eq(ltOffers.id, input.id));
      return { success: true };
    }),
});
