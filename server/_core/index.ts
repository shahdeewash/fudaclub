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
    return res.json({ received: true });
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
}

startServer().catch(console.error);
