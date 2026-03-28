/**
 * One-shot Square catalog sync script.
 * Run with: npx tsx scripts/sync-now.mts
 */
import { getAllSquareConnections, syncSquareCatalog } from "../server/square.js";

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found. Connect Square from the Admin panel first.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Syncing with Square account: ${conn.merchantName} (${conn.merchantId})`);
console.log("Menu filter: FUDA Lunch");

const result = await syncSquareCatalog(conn.accessToken, "FUDA Lunch");
console.log("Sync complete:", result);
process.exit(0);
