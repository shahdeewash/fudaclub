/**
 * List all Square printer profiles for this merchant
 * Usage: npx tsx scripts/list-printer-profiles.mts
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

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

console.log("Merchant:", conn.merchantId);
console.log("Location:", conn.locationId);
console.log("");

// List printer profiles via the Merchants API
try {
  // Square stores printer profiles under the location settings
  // Use the v2 REST API directly since SDK may not expose this
  const res = await fetch(
    `${SQ_ENV}/v2/merchants/${conn.merchantId}/printer-profiles`,
    {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18",
      },
    }
  );
  const data = await res.json();
  console.log("Printer profiles response:", JSON.stringify(data, null, 2));
} catch (e: any) {
  console.error("Error:", e?.message ?? e);
}

// Also try the location-level printer profiles
try {
  const res = await fetch(
    `${SQ_ENV}/v2/locations/${conn.locationId}/printer-profiles`,
    {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18",
      },
    }
  );
  const data = await res.json();
  console.log("\nLocation printer profiles:", JSON.stringify(data, null, 2));
} catch (e: any) {
  console.error("Location profiles error:", e?.message ?? e);
}

process.exit(0);
