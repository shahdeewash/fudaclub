/**
 * Diagnostic: check what Square Devices API returns for this account
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

console.log("Using token:", conn.accessToken.slice(0, 20) + "...");
console.log("Environment:", SQ_ENV);

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

// Try 1: devices.list()
try {
  const res1 = await (client.devices as any).list({});
  console.log("\n=== devices.list ===");
  console.log(JSON.stringify(res1, null, 2));
} catch (e: any) {
  console.log("\n=== devices.list ERROR ===", e?.message ?? e);
}

// Try 2: devices.codes (list device codes / pairing codes)
try {
  const res2 = await (client.devices as any).codes.list({});
  console.log("\n=== devices.codes.list ===");
  console.log(JSON.stringify(res2, null, 2));
} catch (e: any) {
  console.log("\n=== devices.codes.list ERROR ===", e?.message ?? e);
}

process.exit(0);
