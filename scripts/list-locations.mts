/**
 * List all Square locations for this merchant account
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

try {
  const res = await client.locations.list();
  const locations = (res as any)?.locations ?? [];
  console.log(`Found ${locations.length} location(s):\n`);
  for (const loc of locations) {
    console.log(`ID:      ${loc.id}`);
    console.log(`Name:    ${loc.name}`);
    console.log(`Status:  ${loc.status}`);
    console.log(`Address: ${loc.address?.addressLine1 ?? ''}, ${loc.address?.locality ?? ''}`);
    console.log("---");
  }
} catch (e: any) {
  console.error("Error:", e?.message ?? e);
}

process.exit(0);
