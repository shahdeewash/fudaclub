/**
 * Deep diagnostic: check Square environment, location, orders, and KDS configuration
 * Usage: npx tsx scripts/deep-diagnose.mts
 */
import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "../server/db.js";
import { squareConnections } from "../drizzle/schema.js";

const SQ_ENV =
  (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

const db = await getDb();
if (!db) { console.error("No DB"); process.exit(1); }

const rows = await db.select().from(squareConnections).limit(1);
const conn = rows[0];
if (!conn) { console.error("No Square connection in DB"); process.exit(1); }

console.log("=== SQUARE DEEP DIAGNOSTIC ===\n");
console.log("Merchant ID:", conn.merchantId);
console.log("Location ID:", conn.locationId);
console.log("Environment:", SQ_ENV);
console.log("Access Token (first 20 chars):", conn.accessToken?.substring(0, 20) + "...");
console.log("Is Sandbox:", SQ_ENV === SquareEnvironment.Sandbox);
console.log("");

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

// 1. Check location details
console.log("=== 1. LOCATION DETAILS ===");
try {
  const locRes = await (client.locations as any).retrieve(conn.locationId);
  const loc = locRes?.location;
  if (loc) {
    console.log("Name:", loc.name);
    console.log("Status:", loc.status);
    console.log("Country:", loc.country);
    console.log("Currency:", loc.currency);
    console.log("Capabilities:", JSON.stringify(loc.capabilities));
    console.log("Timezone:", loc.timezone);
    console.log("Type:", loc.type);
  } else {
    console.log("❌ Could not retrieve location:", JSON.stringify(locRes));
  }
} catch (e: any) {
  console.error("❌ Location error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// 2. Check recent orders
console.log("\n=== 2. RECENT ORDERS (last 5) ===");
try {
  const searchRes = await (client.orders as any).search({
    locationIds: [conn.locationId],
    query: {
      sort: { sortField: "CREATED_AT", sortOrder: "DESC" },
      limit: 5,
    },
  });
  const orders = searchRes?.orders ?? [];
  console.log("Total orders found:", orders.length);
  for (const o of orders) {
    console.log(`\nOrder ID: ${o.id}`);
    console.log("  State:", o.state);
    console.log("  Reference:", o.referenceId);
    console.log("  Source:", JSON.stringify(o.source));
    console.log("  Created:", o.createdAt);
    console.log("  Fulfillments:", JSON.stringify(o.fulfillments?.map((f: any) => ({
      type: f.type,
      state: f.state,
      recipient: f.pickupDetails?.recipient?.displayName,
    }))));
  }
} catch (e: any) {
  console.error("❌ Orders search error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// 3. Check devices / terminals
console.log("\n=== 3. DEVICES ===");
try {
  const devRes = await (client.devices as any).list({ locationId: conn.locationId });
  const devices = devRes?.devices ?? [];
  console.log("Devices found:", devices.length);
  for (const d of devices) {
    console.log(`\nDevice ID: ${d.id}`);
    console.log("  Name:", d.name);
    console.log("  Status:", d.status?.category);
    console.log("  Product type:", d.deviceType ?? d.productType);
    console.log("  Location:", d.locationId);
  }
  if (devices.length === 0) {
    console.log("No devices found for this location.");
  }
} catch (e: any) {
  console.error("❌ Devices error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// 4. Check merchant info
console.log("\n=== 4. MERCHANT INFO ===");
try {
  const merRes = await (client.merchants as any).retrieve(conn.merchantId);
  const mer = merRes?.merchant;
  if (mer) {
    console.log("Business name:", mer.businessName);
    console.log("Country:", mer.country);
    console.log("Language:", mer.languageCode);
    console.log("Currency:", mer.currency);
    console.log("Status:", mer.status);
  }
} catch (e: any) {
  console.error("❌ Merchant error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

// 5. Check all locations
console.log("\n=== 5. ALL LOCATIONS ===");
try {
  const allLocRes = await (client.locations as any).list();
  const locs = allLocRes?.locations ?? [];
  console.log("Total locations:", locs.length);
  for (const l of locs) {
    console.log(`\nLocation ID: ${l.id} (${l.name})`);
    console.log("  Status:", l.status);
    console.log("  Type:", l.type);
    console.log("  Capabilities:", JSON.stringify(l.capabilities));
  }
} catch (e: any) {
  console.error("❌ All locations error:", e?.message);
}

// 6. Check the specific test order we just created
console.log("\n=== 6. SPECIFIC ORDER LOOKUP (79JTT3nj5Ns6SQkROUGDuY77haVZY) ===");
try {
  const orderRes = await (client.orders as any).retrieve("79JTT3nj5Ns6SQkROUGDuY77haVZY");
  const o = orderRes?.order;
  if (o) {
    console.log("Found order:", o.id);
    console.log("  State:", o.state);
    console.log("  Location:", o.locationId);
    console.log("  Source:", JSON.stringify(o.source));
    console.log("  Fulfillments:", JSON.stringify(o.fulfillments, null, 2));
    console.log("  Line items:", o.lineItems?.map((li: any) => li.name).join(", "));
  } else {
    console.log("Order not found in response:", JSON.stringify(orderRes));
  }
} catch (e: any) {
  console.error("❌ Order lookup error:", e?.message);
  console.error("Details:", JSON.stringify(e?.errors ?? e?.body ?? {}, null, 2));
}

console.log("\n=== DIAGNOSTIC COMPLETE ===");
process.exit(0);
