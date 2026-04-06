/**
 * Test v4: Create Square Order + record EXTERNAL payment
 * Root cause: Square only shows orders in POS AFTER they are paid.
 * Fix: Record an EXTERNAL payment (type=OTHER, source=FÜDA App) to mark order as paid.
 * Usage: npx tsx scripts/test-square-order-v4.mts
 */
import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "../server/db.js";
import { squareConnections } from "../drizzle/schema.js";
import { randomUUID } from "crypto";

const SQ_ENV =
  (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

const db = await getDb();
if (!db) { console.error("No DB"); process.exit(1); }

const rows = await db.select().from(squareConnections).limit(1);
const conn = rows[0];
if (!conn) { console.error("No Square connection in DB"); process.exit(1); }

console.log("Merchant:", conn.merchantId);
console.log("Location:", conn.locationId);
console.log("Environment:", SQ_ENV);

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });
const locationId = conn.locationId ?? "";

// Step 1: Create the order
console.log("\n--- Step 1: Creating Square Order ---");
let squareOrderId: string | undefined;
let totalAmount: bigint = BigInt(0);

try {
  const orderRes = await (client.orders as any).create({
    order: {
      locationId,
      state: "OPEN",
      source: { name: "FÜDA" },
      lineItems: [
        {
          name: "FUDA Test v4 — Momo (Steamed)",
          quantity: "2",
          basePriceMoney: { amount: BigInt(1200), currency: "AUD" },
          note: "Test v4 - with external payment",
        },
        {
          name: "FUDA Test v4 — Bubble Tea",
          quantity: "1",
          basePriceMoney: { amount: BigInt(650), currency: "AUD" },
        },
      ],
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickupDetails: {
            recipient: { displayName: "Test Customer v4" },
            pickupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            note: "FUDA test v4 — please ignore",
          },
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });

  const order = orderRes?.order;
  squareOrderId = order?.id;
  const rawTotal = order?.totalMoney?.amount;
  totalAmount = typeof rawTotal === "bigint" ? rawTotal : BigInt(rawTotal ?? 0);

  if (squareOrderId) {
    console.log("✅ Order created:", squareOrderId);
    console.log("   State:", order.state);
    console.log("   Total:", `AUD $${(Number(totalAmount) / 100).toFixed(2)}`);
  } else {
    console.error("❌ Order creation failed:", JSON.stringify(orderRes));
    process.exit(1);
  }
} catch (e: any) {
  console.error("❌ Order creation error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
  process.exit(1);
}

// Step 2: Record external payment to make order appear in POS
console.log("\n--- Step 2: Recording EXTERNAL payment ---");
try {
  const paymentRes = await (client.payments as any).create({
    sourceId: "EXTERNAL",
    idempotencyKey: randomUUID(),
    amountMoney: {
      amount: totalAmount,
      currency: "AUD",
    },
    orderId: squareOrderId,
    locationId,
    externalDetails: {
      type: "OTHER",
      source: "FÜDA App",
      sourceFeeMoney: { amount: BigInt(0), currency: "AUD" },
    },
    note: "FÜDA test v4 — paid via app",
  });

  const payment = paymentRes?.payment;
  if (payment?.id) {
    console.log("✅ External payment recorded:", payment.id);
    console.log("   Status:", payment.status);
    console.log("   Amount:", `AUD $${(Number(payment.amountMoney?.amount ?? 0) / 100).toFixed(2)}`);
  } else {
    console.error("❌ Payment failed:", JSON.stringify(paymentRes));
  }
} catch (e: any) {
  console.error("❌ Payment error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

console.log("\n📋 Order ID:", squareOrderId);
console.log("   Check Square POS → Orders tab NOW.");
console.log("   The order should appear as COMPLETED with a receipt ready to print.");
console.log("\n   Square Dashboard:");
console.log("   https://squareup.com/dashboard/orders/overview");

process.exit(0);
