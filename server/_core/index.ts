import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import * as db from "../db";
import { nanoid } from "nanoid";
import { notifyOwner } from "./notification";
import {
  exchangeSquareCode,
  fetchMerchantName,
  fetchFirstLocationId,
  saveSquareConnection,
  syncSquareCatalog,
  getAllSquareConnections,
} from "../square";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Stripe webhook MUST be registered BEFORE express.json() to get raw body
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: any, res: any) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(400).json({ error: "Webhook secret not configured" });
    }
    let event: any;
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ error: err.message });
    }
    // Handle test events
    if (event.id.startsWith("evt_test_")) {
      console.log("[Webhook] Test event detected, returning verification response");
      return res.json({ verified: true });
    }
    console.log("[Stripe Webhook] Event received:", event.type, event.id);
    // Handle checkout.session.completed - fallback order creation if success page wasn't reached
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("[Stripe Webhook] Payment completed for session:", session.id);

      try {
        // Check if order already exists for this session (idempotency)
        const existingOrder = await db.getOrderByStripeSessionId(session.id);
        if (existingOrder) {
          console.log("[Stripe Webhook] Order already exists for session:", session.id, "- skipping");
        } else {
          console.log("[Stripe Webhook] No order found for session:", session.id, "- creating fallback order");

          // Parse order data from metadata
          const orderDataStr = session.metadata?.order_data;
          const userId = session.metadata?.user_id ? parseInt(session.metadata.user_id) : null;

          if (orderDataStr && userId) {
            const orderData = JSON.parse(orderDataStr) as {
              items: Array<{ menuItemId: number; quantity: number; price: number }>;
              deliveryFee: number;
              tax: number;
              dailyCreditApplied: boolean;
              specialInstructions?: string;
            };

            // Look up user
            const user = await db.getUserById(userId);
            if (user && user.companyId) {
              const menuItemsData = await db.getAllMenuItems();
              const menuItemMap = new Map(menuItemsData.map(item => [item.id, item]));

              let dailyCreditRecord = await db.getDailyCreditForToday(userId);
              if (!dailyCreditRecord) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dailyCreditRecord = await db.createDailyCredit({ userId, creditDate: today, isUsed: false });
              }
              const canUseCredit = !dailyCreditRecord.isUsed;

              const orderItemsData: Array<{ menuItemId: number; itemName: string; quantity: number; unitPrice: number; totalPrice: number; isFree: boolean }> = [];
              let subtotal = 0;
              let creditApplied = false;

              for (const item of orderData.items) {
                const menuItem = menuItemMap.get(item.menuItemId);
                if (!menuItem) continue;

                if (canUseCredit && !creditApplied && item.quantity > 0) {
                  creditApplied = true;
                  orderItemsData.push({ menuItemId: item.menuItemId, itemName: menuItem.name, quantity: 1, unitPrice: 0, totalPrice: 0, isFree: true });
                  if (item.quantity > 1) {
                    const rem = item.quantity - 1;
                    const remTotal = menuItem.price * rem;
                    orderItemsData.push({ menuItemId: item.menuItemId, itemName: menuItem.name, quantity: rem, unitPrice: menuItem.price, totalPrice: remTotal, isFree: false });
                    subtotal += remTotal;
                  }
                } else {
                  const totalPrice = menuItem.price * item.quantity;
                  orderItemsData.push({ menuItemId: item.menuItemId, itemName: menuItem.name, quantity: item.quantity, unitPrice: menuItem.price, totalPrice, isFree: false });
                  subtotal += totalPrice;
                }
              }

              const companyOrders = await db.getOrdersByCompanyToday(user.companyId);
              const isFreeDelivery = (companyOrders.length + 1) >= 5;
              const deliveryFee = isFreeDelivery ? 0 : 800;
              const tax = Math.round((subtotal + deliveryFee) * 0.1);
              const total = subtotal + deliveryFee + tax;

              const order = await db.createOrder({
                userId,
                companyId: user.companyId,
                orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
                orderDate: new Date(),
                status: "confirmed",
                fulfillmentType: isFreeDelivery ? "delivery" : "pickup",
                isFreeDelivery,
                dailyCreditUsed: canUseCredit,
                subtotal,
                deliveryFee,
                tax,
                total,
                specialInstructions: orderData.specialInstructions,
                stripeSessionId: session.id,
              });

              for (const item of orderItemsData) {
                await db.createOrderItem({ orderId: order.id, ...item });
              }

              if (canUseCredit) {
                await db.markDailyCreditAsUsed(dailyCreditRecord.id, order.id);
              }

              // Notify owner
              const itemsSummary = orderItemsData.map(i => `${i.quantity}x ${i.itemName}${i.isFree ? " (free)" : ""}`).join(", ");
              await notifyOwner({
                title: `New Paid Order (Webhook): ${order.orderNumber}`,
                content: `Customer: ${user.name ?? user.email}\nItems: ${itemsSummary}\nTotal: $${(total / 100).toFixed(2)} AUD\nPayment: Stripe (${session.id})`,
              }).catch(() => {});

              console.log("[Stripe Webhook] Fallback order created:", order.orderNumber);
            }
          }
        }
      } catch (err: any) {
        console.error("[Stripe Webhook] Error processing checkout.session.completed:", err.message);
      }
    }
    // Handle subscription lifecycle events for BOTH:
    //   - corporate `subscriptions` table (legacy B2B path), keyed on stripeSubscriptionId
    //   - new `fudaClubSubscriptions` table, keyed on stripeCustomerId until the
    //     subscription.created event populates the stripeSubscriptionId for the first time
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const stripeSub = event.data.object as any;
      console.log(`[Stripe Webhook] Subscription event: ${event.type}, sub: ${stripeSub.id}, customer: ${stripeSub.customer}`);
      try {
        const dbInstance = await db.getDb();
        if (dbInstance) {
          const { subscriptions, fudaClubSubscriptions } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const newStatus: "active" | "canceled" | "past_due" | "trialing" =
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : (stripeSub.status === "active" || stripeSub.status === "trialing" || stripeSub.status === "past_due"
                ? stripeSub.status
                : "canceled");

          // Legacy corporate subs — update by stripeSubscriptionId
          await dbInstance
            .update(subscriptions)
            .set({
              status: newStatus,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
              currentPeriodEnd: stripeSub.current_period_end
                ? new Date(stripeSub.current_period_end * 1000)
                : undefined,
            })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));

          // FÜDA Club subs — match by stripeCustomerId (because stripeSubscriptionId
          // is null until THIS event populates it). Sets the subscriptionId so the
          // welcome-coin gate can finally pass on the next getStatus call.
          const customerId = typeof stripeSub.customer === "string"
            ? stripeSub.customer
            : stripeSub.customer?.id;
          if (customerId) {
            const updateSet: any = {
              stripeSubscriptionId: stripeSub.id,
              status: newStatus,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
            };
            if (stripeSub.current_period_end) {
              updateSet.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
            }
            if (stripeSub.current_period_start) {
              updateSet.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
            }
            const updated = await dbInstance
              .update(fudaClubSubscriptions)
              .set(updateSet)
              .where(eq(fudaClubSubscriptions.stripeCustomerId, customerId));
            console.log(`[Stripe Webhook] FÜDA Club sub for customer ${customerId} updated → ${newStatus}, stripeSubscriptionId=${stripeSub.id}`);
          }

          console.log(`[Stripe Webhook] Subscription ${stripeSub.id} processed (status=${newStatus})`);
        }
      } catch (err: any) {
        console.error("[Stripe Webhook] Error handling subscription event:", err.message);
      }
    }

    return res.json({ received: true });
  });

  // Square OAuth callback — exchanges code for tokens and saves to DB
  app.get("/api/square/callback", async (req: any, res: any) => {
    const { code, state, error } = req.query as Record<string, string>;
    console.log("[Square OAuth] Callback received:", { code: code ? code.substring(0, 10) + "..." : "MISSING", state: state ? "present" : "MISSING", error });
    console.log("[Square OAuth] APP_ID:", process.env.SQUARE_APPLICATION_ID);
    console.log("[Square OAuth] APP_SECRET prefix:", (process.env.SQUARE_APPLICATION_SECRET || "").substring(0, 15));
    console.log("[Square OAuth] ENV:", process.env.SQUARE_ENVIRONMENT);

    if (error) {
      console.error("[Square OAuth] Error from Square:", error);
      return res.redirect(`/?square_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    let parsedState: { userId: number; origin: string };
    try {
      parsedState = JSON.parse(Buffer.from(state, "base64url").toString());
      console.log("[Square OAuth] Parsed state:", parsedState);
    } catch {
      return res.status(400).send("Invalid state parameter");
    }

    const { userId, origin } = parsedState;
    const redirectUri = `${origin}/api/square/callback`;
    console.log("[Square OAuth] Attempting token exchange with redirectUri:", redirectUri);

    try {
      const tokens = await exchangeSquareCode(code, redirectUri);
      console.log("[Square OAuth] Token exchange successful, merchantId:", tokens.merchantId);
      const merchantName = await fetchMerchantName(tokens.accessToken).catch(() => "Unknown");
      const locationId = await fetchFirstLocationId(tokens.accessToken).catch(() => null);

      await saveSquareConnection(userId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        merchantId: tokens.merchantId,
        merchantName,
        locationId,
        expiresAt: tokens.expiresAt,
      });

      console.log(`[Square OAuth] Connected merchant: ${merchantName} for user ${userId}`);
      // Redirect back to admin page with success flag
      return res.redirect(`${origin}/admin?square_connected=1`);
    } catch (err: any) {
      console.error("[Square OAuth] Token exchange failed:", err.message);
      return res.redirect(`${origin}/admin?square_error=${encodeURIComponent(err.message)}`);
    }
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Image upload endpoint
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
  app.post("/api/upload-image", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const ext = req.file.mimetype.split("/")[1] || "jpg";
      const key = `menu-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      return res.json({ url });
    } catch (error: any) {
      console.error("Image upload error:", error);
      return res.status(500).json({ error: error.message || "Upload failed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Daily cron job: send subscription expiry reminders at 8:00 AM Darwin time (UTC+9:30 = 22:30 UTC previous day)
  // Runs every 24 hours starting from the next 22:30 UTC
  scheduleDailyExpiryReminders();

  // Daily cron job: auto-sync Square catalog at 6:00 AM Darwin time (UTC+9:30 = 20:30 UTC previous day)
  scheduleDailySquareSync();

  // Daily cron job: issue FÜDA Coins to active Club members at 6:00 AM Darwin time
  scheduleDailyFudaCoins();
}

function scheduleDailyExpiryReminders() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  async function runReminders() {
    try {
      console.log("[Cron] Running daily subscription expiry reminder check...");
      const expiring = await db.getSubscriptionsExpiringWithin(3);
      if (expiring.length === 0) {
        console.log("[Cron] No subscriptions expiring in the next 3 days.");
        return;
      }
      let sent = 0;
      for (const sub of expiring) {
        const planLabel = (sub as any).planType === "monthly" ? "Monthly ($500)" : "Fortnightly ($270)";
        const expiryDate = new Date(sub.currentPeriodEnd).toLocaleDateString("en-AU", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Australia/Darwin",
        });
        await notifyOwner({
          title: `Subscription Expiring Soon: ${(sub as any).userName ?? (sub as any).userEmail ?? "Unknown"}`,
          content: `Plan: ${planLabel}\nCustomer: ${(sub as any).userName ?? "N/A"} (${(sub as any).userEmail ?? "N/A"})\nExpires: ${expiryDate}\nStripe ID: ${sub.stripeSubscriptionId ?? "N/A"}`,
        }).catch(() => {});
        sent++;
      }
      console.log(`[Cron] Sent ${sent} subscription expiry reminder(s).`);
    } catch (err: any) {
      console.error("[Cron] Expiry reminder job failed:", err.message);
    }
  }

  // Calculate ms until next 22:30 UTC (= 8:00 AM Darwin)
  function msUntilNext2230UTC(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(22, 30, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  // Schedule first run at next 22:30 UTC, then every 24h
  const initialDelay = msUntilNext2230UTC();
  console.log(`[Cron] Subscription expiry reminder scheduled in ${Math.round(initialDelay / 60000)} minutes (next 8:00 AM Darwin time).`);
  setTimeout(() => {
    runReminders();
    setInterval(runReminders, INTERVAL_MS);
  }, initialDelay);
}

function scheduleDailySquareSync() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  async function runSync() {
    try {
      console.log("[Cron] Running daily Square catalog sync...");
      // Find all admin users with a Square connection
      const connections = await getAllSquareConnections();
      if (!connections || connections.length === 0) {
        console.log("[Cron] No Square connections found, skipping sync.");
        return;
      }
      let totalImported = 0;
      let totalUpdated = 0;
      for (const conn of connections) {
        try {
          // Sync ONLY the "Lunch Menu" from Square — this is the FÜDA Club lunch subscription menu.
          // (Note: "Fuda Lunch" is a printer profile in Square, not a menu — don't confuse the two.)
          // Name matched case-insensitively; sub-menus under "Lunch Menu" are auto-included.
          const result = await syncSquareCatalog(conn.accessToken, "Lunch Menu");
          totalImported += result.imported;
          totalUpdated += result.updated;
          console.log(`[Cron] Square sync for merchant ${conn.merchantId}: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`);
        } catch (err: any) {
          console.error(`[Cron] Square sync failed for merchant ${conn.merchantId}:`, err.message);
        }
      }
      console.log(`[Cron] Daily Square sync complete: ${totalImported} imported, ${totalUpdated} updated across ${connections.length} connection(s).`);
    } catch (err: any) {
      console.error("[Cron] Daily Square sync job failed:", err.message);
    }
  }

  // Calculate ms until next 20:30 UTC (= 6:00 AM Darwin)
  function msUntilNext2030UTC(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(20, 30, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  const initialDelay = msUntilNext2030UTC();
  console.log(`[Cron] Square catalog auto-sync scheduled in ${Math.round(initialDelay / 60000)} minutes (next 6:00 AM Darwin time).`);
  setTimeout(() => {
    runSync();
    setInterval(runSync, INTERVAL_MS);
  }, initialDelay);
}

/**
 * FÜDA Club: issue 1 coin per active (non-frozen) Club member each Mon–Sat at 6:00 AM Darwin time.
 * Rolls over if FÜDA is closed that day (checks fudaClosureDates table).
 * Also checks for monthly streak bonus at end of each calendar month.
 */
function scheduleDailyFudaCoins() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function runDailyCoins() {
    try {
      const dbInstance = await db.getDb();
      if (!dbInstance) { console.warn("[Cron-Coins] DB unavailable, skipping."); return; }

      const { fudaClubSubscriptions, fudaCoins, fudaClosureDates, users } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, isNull, count } = await import("drizzle-orm");
      const { issueFudaCoin } = await import("../routers/fudaClub");

      // Get Darwin today
      const nowDarwin = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
      const dayOfWeek = new Date().toLocaleDateString("en-US", { timeZone: "Australia/Darwin", weekday: "short" });
      const isWeekday = !["Sun"].includes(dayOfWeek); // Mon–Sat valid

      if (!isWeekday) {
        console.log(`[Cron-Coins] Today is ${dayOfWeek} — no coins issued (Sun only).`);
        return;
      }

      // Check if FÜDA is closed today
      const [ty, tm, td] = nowDarwin.split("-").map(Number);
      const todayDateUTC = new Date(Date.UTC(ty, tm - 1, td));
      const [closure] = await dbInstance
        .select()
        .from(fudaClosureDates)
        .where(eq(fudaClosureDates.closureDate, todayDateUTC))
        .limit(1);

      // ── Compute "weekly bucket" expiry — 00:00 Darwin on the upcoming Monday ──
      // New rule: coins issued any day Mon-Sat all expire at the same moment —
      // 00:00 Darwin time on the next Monday. So a Mon coin is valid Mon-Sun (7 days),
      // a Sat coin is valid Sat-Sun (2 days), and the whole bucket resets on Monday.
      // This is the "weekly bucket" model — kinder than the old 2-day rolling expiry,
      // and easier to communicate ("up to 6 free lunches a week").
      const daysToNextMonday: Record<string, number> = {
        Mon: 7, Tue: 6, Wed: 5, Thu: 4, Fri: 3, Sat: 2, Sun: 1,
      };
      const [y, m, d] = nowDarwin.split("-").map(Number);
      const daysAhead = daysToNextMonday[dayOfWeek] ?? 7;
      // 14:30 UTC = 00:00 Darwin (UTC+9:30), so the coin expires precisely at the
      // start of the upcoming Monday in Darwin time.
      const expiresAt = new Date(Date.UTC(y, m - 1, d + daysAhead, 14, 30, 0));

      if (closure) {
        console.log(`[Cron-Coins] FÜDA closed today (${closure.reason ?? "no reason given"}) — issuing rollover coin with end-of-week expiry.`);
        // Same weekly-bucket expiry as a regular daily coin — the only difference
        // is the reason code ("rollover" vs "daily") so it's distinguishable in
        // the member's coin history.
        const activeSubs = await dbInstance
          .select({ userId: fudaClubSubscriptions.userId })
          .from(fudaClubSubscriptions)
          .where(eq(fudaClubSubscriptions.status, "active"));

        for (const sub of activeSubs) {
          await issueFudaCoin(sub.userId, "rollover", expiresAt);
        }
        console.log(`[Cron-Coins] Issued ${activeSubs.length} rollover coin(s) — expires ${expiresAt.toISOString()}.`);
        return;
      }

      // Issue daily coins — expires Monday 00:00 Darwin (weekly bucket model).

      const activeSubs = await dbInstance
        .select({ userId: fudaClubSubscriptions.userId })
        .from(fudaClubSubscriptions)
        .where(eq(fudaClubSubscriptions.status, "active"));

      let issued = 0;
      for (const sub of activeSubs) {
        await issueFudaCoin(sub.userId, "daily", expiresAt);
        issued++;
      }
      console.log(`[Cron-Coins] Issued ${issued} daily FÜDA Coin(s) for ${nowDarwin}.`);

      // Monthly streak bonus: check if today is the last working day of the month
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDarwin = tomorrow.toLocaleDateString("en-CA", { timeZone: "Australia/Darwin" });
      const tomorrowMonth = tomorrowDarwin.substring(0, 7);
      const todayMonth = nowDarwin.substring(0, 7);
      if (tomorrowMonth !== todayMonth) {
        // Last day of the month — check streak for each active member
        console.log("[Cron-Coins] End of month — checking streak bonuses...");
        const monthStart = `${todayMonth}-01`;
        for (const sub of activeSubs) {
          try {
            // Count coins issued this month
            const monthCoins = await dbInstance
              .select({ id: fudaCoins.id, isUsed: fudaCoins.isUsed })
              .from(fudaCoins)
              .where(
                and(
                  eq(fudaCoins.userId, sub.userId),
                  eq(fudaCoins.reason, "daily"),
                  gte(fudaCoins.issuedAt, new Date(monthStart + "T00:00:00Z")),
                  lte(fudaCoins.issuedAt, new Date())
                )
              );
            const totalIssued = monthCoins.length;
            const usedCount = monthCoins.filter(c => c.isUsed).length;
            // Streak = all issued coins were used (no wastage)
            if (totalIssued > 0 && usedCount === totalIssued) {
              const bonusExpiry = new Date();
              bonusExpiry.setDate(bonusExpiry.getDate() + 7); // 1 week to use bonus coin
              await issueFudaCoin(sub.userId, "streak_bonus", bonusExpiry);
              console.log(`[Cron-Coins] Streak bonus issued to user ${sub.userId} (${usedCount}/${totalIssued} coins used).`);
            }
          } catch (err: any) {
            console.error(`[Cron-Coins] Streak check failed for user ${sub.userId}:`, err.message);
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron-Coins] Daily coin job failed:", err.message);
    }
  }

  // Run at 6:00 AM Darwin = 20:30 UTC (same time as Square sync)
  function msUntilNext2030UTC(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(20, 30, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }

  const initialDelay = msUntilNext2030UTC();
  console.log(`[Cron-Coins] FÜDA Club daily coin issuance scheduled in ${Math.round(initialDelay / 60000)} minutes (next 6:00 AM Darwin time).`);
  setTimeout(() => {
    runDailyCoins();
    setInterval(runDailyCoins, INTERVAL_MS);
  }, initialDelay);
}

startServer().catch(console.error);
