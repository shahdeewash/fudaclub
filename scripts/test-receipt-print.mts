/**
 * Test script: create a Square Order and trigger receipt printing on the terminal
 * Usage: npx tsx scripts/test-receipt-print.mts
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
console.log("Terminal device ID:", conn.terminalDeviceId);
console.log("Environment:", SQ_ENV);

if (!conn.terminalDeviceId) {
  console.error("No terminal device ID set — cannot test receipt printing");
  process.exit(1);
}

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });
const locationId = conn.locationId ?? "";

if (!locationId) {
  console.error("No locationId on connection — cannot create order");
  process.exit(1);
}

// Step 1: Create a Square Order
console.log("\n--- Step 1: Creating Square Order ---");
let squareOrderId: string | null = null;
try {
  const orderRes = await client.orders.create({
    order: {
      locationId,
      lineItems: [
        {
          name: "TEST ITEM (Receipt Print Test)",
          quantity: "1",
          basePriceMoney: { amount: BigInt(1000), currency: "AUD" }, // $10.00 AUD test
          note: "This is a test order — please ignore",
        },
      ],
      metadata: {
        source: "fuda-receipt-test",
        test: "true",
      },
    },
    idempotencyKey: randomUUID(),
  });

  squareOrderId = (orderRes as any)?.order?.id ?? null;
  if (squareOrderId) {
    console.log("✅ Square Order created:", squareOrderId);
  } else {
    console.error("❌ Order created but no ID returned:", JSON.stringify(orderRes, null, 2));
    process.exit(1);
  }
} catch (e: any) {
  console.error("❌ Failed to create Square Order:", e?.message ?? e);
  try { console.error("Details:", JSON.stringify(e?.errors ?? e, null, 2)); } catch {}
  process.exit(1);
}

// Step 2: Create a Terminal Checkout to trigger receipt print
console.log("\n--- Step 2: Creating Terminal Checkout (triggers receipt print) ---");
try {
  const checkoutRes = await (client.terminal as any).checkouts.create({
    idempotencyKey: randomUUID(),
    checkout: {
      orderId: squareOrderId,
      amountMoney: { amount: BigInt(1000), currency: "AUD" }, // must match order total ($10.00 AUD)
      deviceOptions: {
        deviceId: conn.terminalDeviceId,
        skipReceiptScreen: false,
        collectSignature: false,
      },
      paymentOptions: {
        autocomplete: true,
      },
      note: "FUDA Receipt Print Test",
    },
  });

  const checkout = (checkoutRes as any)?.checkout;
  if (checkout?.id) {
    console.log("✅ Terminal Checkout created:", checkout.id);
    console.log("   Status:", checkout.status);
    console.log("   Device ID:", checkout.deviceOptions?.deviceId);
    console.log("\n🖨️  Receipt should be printing on terminal", conn.terminalDeviceId);
  } else {
    console.error("❌ Checkout created but unexpected response:", JSON.stringify(checkoutRes, null, 2));
  }
} catch (e: any) {
  console.error("❌ Failed to create Terminal Checkout:", e?.message ?? e);
  try { console.error("Details:", JSON.stringify(e?.errors ?? e, null, 2)); } catch {}
  process.exit(1);
}

process.exit(0);
