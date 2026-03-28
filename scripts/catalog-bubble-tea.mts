/**
 * Show full Bubble Tea category hierarchy and items.
 */
import { getAllSquareConnections } from "../server/square.js";
import { SquareClient, SquareEnvironment } from "square";

const SQ_ENV = (process.env.SQUARE_ENVIRONMENT === "production")
  ? SquareEnvironment.Production
  : SquareEnvironment.Sandbox;

const connections = await getAllSquareConnections();
const conn = connections[0];
const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

// Build full category map
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

// Find Bubble Tea menu root
let bubbleTeaRootId: string | null = null;
for (const [id, info] of categoryInfoMap.entries()) {
  if (info.name.toLowerCase() === "bubble tea" && info.categoryType === "MENU_CATEGORY") {
    bubbleTeaRootId = id;
    console.log(`Root Bubble Tea menu: [${id}] ${info.name}`);
    break;
  }
}

if (!bubbleTeaRootId) {
  console.error("No Bubble Tea MENU_CATEGORY found at root level");
  process.exit(1);
}

// Collect all descendant category IDs
function getDescendants(rootId: string): string[] {
  const result: string[] = [rootId];
  for (const [id, info] of categoryInfoMap.entries()) {
    if (info.parentId === rootId) {
      result.push(...getDescendants(id));
    }
  }
  return result;
}

const allBubbleTeaCatIds = getDescendants(bubbleTeaRootId);
console.log(`\nAll Bubble Tea category IDs (${allBubbleTeaCatIds.length}):`);
for (const id of allBubbleTeaCatIds) {
  const info = categoryInfoMap.get(id)!;
  console.log(`  [${id}] ${info.name} (${info.categoryType}) parent:${info.parentId ?? "none"}`);
}

// Now fetch items and check which ones belong to these categories
console.log("\n=== ITEMS in Bubble Tea menu ===");
const itemPage = await client.catalog.list({ types: "ITEM" });
let found = 0;
for await (const obj of itemPage) {
  const o = obj as any;
  const d = o.itemData;
  const cats: string[] = d?.categories?.map((c: any) => c.id) ?? [];
  const reportingCat: string | null = d?.reportingCategory?.id ?? null;
  const allItemCats = [...cats, ...(reportingCat ? [reportingCat] : [])];
  
  const match = allItemCats.some(c => allBubbleTeaCatIds.includes(c));
  if (match) {
    console.log(`  [${o.id}] ${d?.name}`);
    console.log(`    categories: ${cats.join(", ")}`);
    console.log(`    reportingCategory: ${reportingCat}`);
    const variations = d?.variations ?? [];
    for (const v of variations) {
      const vd = (v as any).itemVariationData;
      console.log(`    variation: [${(v as any).id}] ${vd?.name} — price: ${vd?.priceMoney?.amount} ${vd?.priceMoney?.currency}`);
    }
    found++;
  }
}
console.log(`\nFound ${found} items in Bubble Tea menu`);
process.exit(0);
