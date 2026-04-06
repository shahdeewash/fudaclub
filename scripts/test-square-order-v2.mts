/**
 * Test v2: create a Square Order with state=OPEN and source.name
 * GPT-4o recommended fix to make orders visible in Square POS
 * Usage: npx tsx scripts/test-square-order-v2.mts
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

if (!locationId) {
  console.error("No locationId — cannot create order");
  process.exit(1);
}

console.log("\n--- Creating test Square Order v2 (state=OPEN, source.name=FÜDA) ---");
try {
  const orderRes = await (client.orders as any).create({
    order: {
      locationId,
      state: "OPEN",          // GPT fix: explicit OPEN state
      source: { name: "FÜDA" }, // GPT fix: source name for POS routing
      lineItems: [
        {
          name: "FUDA Test v2 — Momo (Steamed)",
          quantity: "2",
          basePriceMoney: { amount: BigInt(1200), currency: "AUD" },
          note: "Test order v2 - state=OPEN fix",
        },
        {
          name: "FUDA Test v2 — Bubble Tea",
          quantity: "1",
          basePriceMoney: { amount: BigInt(650), currency: "AUD" },
        },
      ],
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickupDetails: {
            recipient: {
              displayName: "Test Customer v2",
            },
            pickupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            note: "FUDA test v2 — please ignore",
          },
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });

  const order = (orderRes as any)?.order;
  if (order?.id) {
    const total = Number(order.totalMoney?.amount ?? 0) / 100;
    console.log("\n✅ Square Order v2 created successfully!");
    console.log("   Order ID:", order.id);
    console.log("   Total:   AUD $" + total.toFixed(2));
    console.log("   Status:  ", order.state);
    console.log("   Source:  ", JSON.stringify(order.source));
    console.log("   Fulfillments:", JSON.stringify(order.fulfillments, null, 2));
    console.log("\n📋 Check Square POS → Orders tab for this order.");
    console.log("   If auto-print is enabled on the Epson TM-T82, it should print automatically.");
    console.log("\n   Square Dashboard:");
    console.log(`   https://squareup.com/dashboard/orders/overview`);
  } else {
    console.error("❌ Unexpected response:", JSON.stringify(orderRes, null, 2));
  }
} catch (e: any) {
  console.error("❌ Failed:", e?.message ?? e);
  try { console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? e, null, 2)); } catch {}
  process.exit(1);
}

process.exit(0);
