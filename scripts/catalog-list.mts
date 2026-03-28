/**
 * List all Square catalog items (names only) to diagnose what's available.
 * Run with: npx tsx scripts/catalog-list.mts
 */
import { getAllSquareConnections } from "../server/square.js";
import { SquareClient, SquareEnvironment } from "square";

const SQ_ENV = (process.env.SQUARE_ENVIRONMENT === "production")
  ? SquareEnvironment.Production
  : SquareEnvironment.Sandbox;

const connections = await getAllSquareConnections();
if (connections.length === 0) {
  console.error("No Square connection found.");
  process.exit(1);
}

const conn = connections[0];
console.log(`Connected to: ${conn.merchantName}`);

const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

// List categories first
console.log("\n=== CATEGORIES ===");
const catPage = await client.catalog.list({ types: "CATEGORY" });
let catCount = 0;
for await (const obj of catPage) {
  const d = (obj as any).categoryData;
  console.log(`  [${(obj as any).id}] ${d?.name} (type: ${d?.categoryType})`);
  catCount++;
  if (catCount > 50) { console.log("  ... (truncated)"); break; }
}

// List items
console.log("\n=== ITEMS ===");
const itemPage = await client.catalog.list({ types: "ITEM" });
let itemCount = 0;
for await (const obj of itemPage) {
  const d = (obj as any).itemData;
  console.log(`  [${(obj as any).id}] ${d?.name}`);
  itemCount++;
  if (itemCount > 50) { console.log("  ... (truncated)"); break; }
}

console.log(`\nTotal: ${catCount} categories, ${itemCount} items`);
process.exit(0);
