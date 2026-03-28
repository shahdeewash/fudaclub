/**
 * Sync only the "samosa" menu from Square catalog.
 * Run with: npx tsx scripts/sync-samosa.mts
 */
import { getAllSquareConnections, syncSquareCatalog } from "../server/square.js";

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Syncing "samosa" menu from Square account: ${conn.merchantName}`);

const result = await syncSquareCatalog(conn.accessToken, "samosa");
console.log("Sync complete:", JSON.stringify(result, null, 2));
process.exit(0);
