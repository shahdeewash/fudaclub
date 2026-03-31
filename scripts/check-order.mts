/**
 * Check a specific Square Order by ID
 */
import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "../server/db.js";
import { squareConnections } from "../drizzle/schema.js";

const ORDER_ID = "7lfyNZb724L6Fvtv2II0pAL4OGWZY";

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
  const res = await (client.orders as any).get({ orderId: ORDER_ID });
  const order = (res as any)?.order;
  if (order) {
    console.log("Order ID:    ", order.id);
    console.log("Location ID: ", order.locationId);
    console.log("State:       ", order.state);
    console.log("Source:      ", order.source?.name ?? "(none)");
    console.log("Fulfillments:", JSON.stringify(order.fulfillments ?? [], null, 2));
    console.log("Line items:  ", order.lineItems?.map((i: any) => `${i.quantity}x ${i.name}`).join(", "));
    console.log("Total:       AUD $" + (Number(order.totalMoney?.amount ?? 0) / 100).toFixed(2));
    console.log("\nFull order:");
    console.log(JSON.stringify(order, null, 2));
  } else {
    console.error("Order not found or empty response:", JSON.stringify(res, null, 2));
  }
} catch (e: any) {
  console.error("Error:", e?.message ?? e);
  try { console.error(JSON.stringify(e?.errors ?? e?.body ?? e, null, 2)); } catch {}
}

process.exit(0);
