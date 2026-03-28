/**
 * Sync ALL menus under the "Eatfuda" parent (auto-includes all child menus).
 * This is the same logic used by the daily cron and Admin sync button.
 * Run with: npx tsx scripts/sync-eatfuda.mts
 */
import { getAllSquareConnections, syncSquareCatalog } from "../server/square.js";

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Syncing "Eatfuda" parent menu from Square account: ${conn.merchantName}`);

const result = await syncSquareCatalog(conn.accessToken, "Eatfuda");
console.log("Sync complete:", JSON.stringify(result, null, 2));
process.exit(0);
