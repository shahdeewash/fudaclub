/**
 * Show the full Eatfuda menu hierarchy with parent IDs.
 */
import { getAllSquareConnections } from "../server/square.js";
import { SquareClient, SquareEnvironment } from "square";

const SQ_ENV = (process.env.SQUARE_ENVIRONMENT === "production")
  ? SquareEnvironment.Production
  : SquareEnvironment.Sandbox;

const connections = await getAllSquareConnections();
const conn = connections[0];
const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

type CatInfo = { name: string; categoryType: string; parentId: string | null };
const categoryInfoMap = new Map<string, CatInfo>();

const catPage = await client.catalog.list({ types: "CATEGORY" });
for await (const obj of catPage) {
  const o = obj as any;
  const d = o.categoryData;
  categoryInfoMap.set(o.id, {
    name: d?.name ?? "?",
    categoryType: d?.categoryType ?? "?",
    parentId: d?.parentCategory?.id ?? null,
  });
}

// Find Eatfuda root
let eatfudaId: string | null = null;
for (const [id, info] of categoryInfoMap.entries()) {
  if (info.name.toLowerCase() === "eatfuda" && info.categoryType === "MENU_CATEGORY") {
    eatfudaId = id;
    console.log(`\nEatfuda root: [${id}]`);
    break;
  }
}

if (!eatfudaId) {
  console.error("Eatfuda MENU_CATEGORY not found");
  process.exit(1);
}

// Print all direct children of Eatfuda
console.log("\nDirect children of Eatfuda:");
for (const [id, info] of categoryInfoMap.entries()) {
  if (info.parentId === eatfudaId) {
    console.log(`  [${id}] ${info.name} (${info.categoryType})`);
  }
}

// Print all MENU_CATEGORY items with their parent
console.log("\nAll MENU_CATEGORY entries with parents:");
for (const [id, info] of categoryInfoMap.entries()) {
  if (info.categoryType === "MENU_CATEGORY") {
    const parentName = info.parentId ? (categoryInfoMap.get(info.parentId)?.name ?? "?") : "ROOT";
    console.log(`  [${id}] ${info.name} → parent: ${parentName} (${info.parentId ?? "none"})`);
  }
}
process.exit(0);
