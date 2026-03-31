/**
 * Test: create a Square Order and confirm it appears in Square POS for printing
 * Usage: npx tsx scripts/test-square-order.mts
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

console.log("\n--- Creating test Square Order ---");
try {
  const orderRes = await client.orders.create({
    order: {
      locationId,
      lineItems: [
        {
          name: "FUDA Test Print — Momo (Steamed)",
          quantity: "2",
          basePriceMoney: { amount: BigInt(1200), currency: "AUD" }, // $12.00 AUD
          note: "Test order for receipt print verification",
        },
        {
          name: "FUDA Test Print — Bubble Tea",
          quantity: "1",
          basePriceMoney: { amount: BigInt(650), currency: "AUD" }, // $6.50 AUD
        },
      ],
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickupDetails: {
            recipient: {
              displayName: "Test Customer",
            },
            note: "FUDA test print — please ignore",
            scheduleType: "ASAP",
          },
        },
      ],
      metadata: {
        source: "fuda-test-print",
        test: "true",
      },
    },
    idempotencyKey: randomUUID(),
  });

  const order = (orderRes as any)?.order;
  if (order?.id) {
    const total = Number(order.totalMoney?.amount ?? 0) / 100;
    console.log("\n✅ Square Order created successfully!");
    console.log("   Order ID:", order.id);
    console.log("   Total:   AUD $" + total.toFixed(2));
    console.log("   Status:  ", order.state);
    console.log("\n📋 This order should now appear in your Square POS app.");
    console.log("   Square POS → Orders → it will show as a new open order.");
    console.log("   If auto-print is enabled on the Epson TM-T82, it will print automatically.");
    console.log("\n   Square Dashboard link:");
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
