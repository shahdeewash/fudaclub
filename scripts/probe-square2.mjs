import { SquareClient, SquareEnvironment } from "square";

// Check the TypeScript types by looking at the SDK source
import { readFileSync } from "fs";
import { resolve } from "path";

// Find the catalog type definitions
const catalogDts = resolve("node_modules/.pnpm/square@44.0.1/node_modules/square/dist/cjs/api/catalog.d.ts");
try {
  const content = readFileSync(catalogDts, "utf8");
  // Find the list method signature
  const listMatch = content.match(/list\([^)]*\)[^;]+;/);
  console.log("catalog.list signature:", listMatch?.[0]);
} catch (e) {
  console.log("Could not read catalog.d.ts:", e.message);
}

// Check Page type
const coreDts = resolve("node_modules/.pnpm/square@44.0.1/node_modules/square/dist/cjs/core/pagination.d.ts");
try {
  const content = readFileSync(coreDts, "utf8");
  console.log("\nPage type definition:\n", content.slice(0, 500));
} catch (e) {
  console.log("Could not read pagination.d.ts:", e.message);
}
