/**
 * Sync only the "Bubble Tea" menu from Square catalog.
 * Run with: npx tsx scripts/sync-bubble-tea.mts
 */
import { getAllSquareConnections, syncSquareCatalog } from "../server/square.js";

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Syncing "Bubble Tea" menu from Square account: ${conn.merchantName}`);

const result = await syncSquareCatalog(conn.accessToken, "Bubble Tea");
console.log("Sync complete:", JSON.stringify(result, null, 2));
process.exit(0);
