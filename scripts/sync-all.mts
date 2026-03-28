/**
 * Sync ALL Square catalog items (no menu name filter).
 * Run with: npx tsx scripts/sync-all.mts
 */
import { getAllSquareConnections, syncSquareCatalog } from "../server/square.js";

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Syncing ALL items from Square account: ${conn.merchantName}`);

const result = await syncSquareCatalog(conn.accessToken, null);
console.log("Sync complete:", JSON.stringify(result, null, 2));
process.exit(0);
