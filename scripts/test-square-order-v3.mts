/**
 * Test v3: SIMPLE fulfillment type (matches how POS creates orders)
 * GPT-4o: PICKUP type may not appear in POS — try SIMPLE type
 * Usage: npx tsx scripts/test-square-order-v3.mts
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

// Test A: SIMPLE fulfillment (matches POS native orders)
console.log("\n--- Test A: SIMPLE fulfillment type ---");
try {
  const orderResA = await (client.orders as any).create({
    order: {
      locationId,
      state: "OPEN",
      lineItems: [
        {
          name: "FUDA Test v3A — Momo (Steamed)",
          quantity: "1",
          basePriceMoney: { amount: BigInt(1200), currency: "AUD" },
          note: "Test v3A - SIMPLE fulfillment",
        },
      ],
      fulfillments: [
        {
          type: "SIMPLE",
          state: "PROPOSED",
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });

  const orderA = (orderResA as any)?.order;
  if (orderA?.id) {
    console.log("✅ Order A created:", orderA.id);
    console.log("   State:", orderA.state);
    console.log("   Fulfillments:", JSON.stringify(orderA.fulfillments));
  } else {
    console.error("❌ Order A failed:", JSON.stringify(orderResA));
  }
} catch (e: any) {
  console.error("❌ Order A error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// Test B: No fulfillment at all (simplest possible)
console.log("\n--- Test B: No fulfillment (simplest) ---");
try {
  const orderResB = await (client.orders as any).create({
    order: {
      locationId,
      state: "OPEN",
      lineItems: [
        {
          name: "FUDA Test v3B — Bubble Tea",
          quantity: "1",
          basePriceMoney: { amount: BigInt(650), currency: "AUD" },
          note: "Test v3B - no fulfillment",
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });

  const orderB = (orderResB as any)?.order;
  if (orderB?.id) {
    console.log("✅ Order B created:", orderB.id);
    console.log("   State:", orderB.state);
    console.log("   Fulfillments:", JSON.stringify(orderB.fulfillments));
  } else {
    console.error("❌ Order B failed:", JSON.stringify(orderResB));
  }
} catch (e: any) {
  console.error("❌ Order B error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// Test C: PICKUP with state READY (not PROPOSED)
console.log("\n--- Test C: PICKUP fulfillment with state=READY ---");
try {
  const orderResC = await (client.orders as any).create({
    order: {
      locationId,
      state: "OPEN",
      lineItems: [
        {
          name: "FUDA Test v3C — Samosa",
          quantity: "2",
          basePriceMoney: { amount: BigInt(500), currency: "AUD" },
          note: "Test v3C - PICKUP READY",
        },
      ],
      fulfillments: [
        {
          type: "PICKUP",
          state: "READY",
          pickupDetails: {
            recipient: { displayName: "Test Customer v3C" },
            pickupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });

  const orderC = (orderResC as any)?.order;
  if (orderC?.id) {
    console.log("✅ Order C created:", orderC.id);
    console.log("   State:", orderC.state);
    console.log("   Fulfillments:", JSON.stringify(orderC.fulfillments));
  } else {
    console.error("❌ Order C failed:", JSON.stringify(orderResC));
  }
} catch (e: any) {
  console.error("❌ Order C error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

console.log("\n📋 Check Square POS → Orders tab for orders A, B, and C.");
console.log("   Which one (if any) appears in POS?");
process.exit(0);
