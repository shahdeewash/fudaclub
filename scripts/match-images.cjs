// Match menu items to image files in the doordash/fuda-menu-images folder.
// - Reads menu items from scripts/menu-dump.json (curl-cached from /api/trpc/menu.getAll)
// - Lists images from the OneDrive photo-shoot folder
// - Normalizes both sides and scores matches; reports unmatched items
// - Writes scripts/image-mapping.json (id → filename) for downstream copy + SQL gen
const fs = require("fs");
const path = require("path");

const IMG_DIR = "C:\\Users\\dee_s\\OneDrive\\Documents\\FÜDA\\FÜDA GLOBAL STREET BITES\\Fuda Food photo shoot\\doordash photo shoot\\fuda-menu-images";

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function score(itemTokens, fileTokens) {
  // Word-level jaccard, weighted toward containment of file in item
  const itemSet = new Set(itemTokens);
  const fileSet = new Set(fileTokens);
  let common = 0;
  for (const t of fileSet) if (itemSet.has(t)) common++;
  if (common === 0) return 0;
  const containment = common / fileSet.size;
  const jaccard = common / new Set([...itemSet, ...fileSet]).size;
  // Reward when ALL of file's tokens appear in item — that's what matters for
  // a confident match. Tiebreak by jaccard so longer item names don't get
  // beaten by short generic file names ("salad").
  return containment * 100 + jaccard;
}

const menu = JSON.parse(fs.readFileSync("scripts/menu-dump.json", "utf8")).result.data.json;
const files = fs.readdirSync(IMG_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f));

console.log(`Menu items: ${menu.length}`);
console.log(`Image files: ${files.length}\n`);

// Manual overrides for filenames that don't naturally tokenize to the item
// name. Keys are normalized item names (lowercased, alphanumerics joined by
// space), values are filenames in IMG_DIR.
const MANUAL = {
  // Combos / kebab-bubble combos — use mixed-grill-kebab as the "any kebab" image
  "3 kebab plate bubble": "mixed-grill-kebab.jpg",
  "any 22 99 kebab main bubble tea": "mixed-grill-kebab.jpg",
  "any 21 99 kebab main bubble tea": "mixed-grill-kebab.jpg",
  "any wrap bubble tea": "kofta-wrap.jpg",
  // Generic bubble tea — use a hero flavor since there's no plain "bubble tea" shot
  "bubble tea": "lychee-rose-oolong.jpg",
  // Cabbage momo / vegetarian momo all map to the vegan momo equivalents
  "cabbage momo 6pcs": "vegan-momo-6-pcs.jpg",
  "vegetarian momo": "vegan-momo.jpg",
  "vegetarian momo 6": "vegan-momo-6-pcs.jpg",
  // Doner / shish wraps — use shish-wrap as the closest visual; we don't have a
  // dedicated chicken-doner-wrap or lamb-doner-wrap photo
  "chicken doner wrap": "chicken-shish-wrap.jpg",
  "chicken doner wrap bubble tea": "chicken-shish-wrap.jpg",
  "chicken kebab": "chicken-shish-kebab.jpg",
  "doner main": "mixed-grill-kebab.jpg",
  "lamb doner wrap": "kofta-wrap.jpg",
  "lamb kebab": "lamb-shish-kebab.jpg",
  "lamb kofta": "kofta-main.jpg",
  "lamb shish wrap": "chicken-shish-wrap.jpg",
  "lamb sish": "lamb-shish-kebab.jpg",
  // Lhaphing → Laphing.png (the only "Laphing" image we have)
  "lhaphing": "Laphing.png",
  "2 lhaphing special": "Laphing.png",
  // Pita bread → use the hummus-with-pita shot since pita is the visual hero
  "pita bread": "hummus-with-pita-bread.jpg",
  // Spinach & fetta spring roll → no dedicated image; use lamb-spring-roll as
  // the closest spring-roll visual
  "spinach and fetta spring roll": "lamb-spring-roll.jpg",
  // Coca-Cola variants — only one Coke image in the set
  "coca cola 600ml": "coca-cola-zero-sugar-can.jpg",
  "coca cola can": "coca-cola-zero-sugar-can.jpg",
  "coca cola zero sugar 600ml": "coca-cola-zero-sugar-can.jpg",
  // Fuze drinks — only Mango maps cleanly to a green-tea image; the rest skip
  "fuze mango green tea": "yuzu-green-tea-fizz.jpg",
  // Ice chocolate ↔ hot chocolate (cup)
  "ice chocolate": "hot-chocolate.jpg",
  // Daily specials map to their base item
  "friday feast friday": "6-family-feast.jpg",
  "momo monday": "chicken-momo.jpg",
  "thu momo staff student faves id": "chicken-momo.jpg",
  "thu wrap staff student faves id required": "kofta-wrap.jpg",
  "tuesday turiksh kebab day": "mixed-grill-kebab.jpg",
  "wed wrap wednesday": "kofta-wrap.jpg",
};

const matches = [];   // {item, file, score}
const unmatched = []; // [item, ...]
const usedFiles = new Set();

for (const item of menu) {
  const norm = normalize(item.name);
  const normJoined = norm.join(" ");
  if (MANUAL[normJoined]) {
    matches.push({ item, file: MANUAL[normJoined], score: 1000 });
    usedFiles.add(MANUAL[normJoined]);
    continue;
  }

  let best = { file: null, score: 0 };
  for (const f of files) {
    const ftokens = normalize(f);
    const s = score(norm, ftokens);
    if (s > best.score) best = { file: f, score: s };
  }
  // Threshold: containment must be ~100% (every file token in item) for a confident
  // match. Lower scores often produce false positives (e.g. "Garden Salad" → any
  // file with "salad" in it). 100 = full containment.
  if (best.score >= 99) {
    matches.push({ item, file: best.file, score: best.score });
    usedFiles.add(best.file);
  } else {
    unmatched.push({ item, bestGuess: best.file, bestScore: best.score });
  }
}

console.log(`✓ Matched: ${matches.length}`);
console.log(`✗ Unmatched: ${unmatched.length}`);
console.log(`Unused images: ${files.length - usedFiles.size}\n`);

console.log("=== MATCHED ===");
for (const m of matches.sort((a, b) => a.item.id - b.item.id)) {
  console.log(`  [${m.item.id.toString().padStart(3)}] ${m.item.name.padEnd(45)} → ${m.file}`);
}

console.log("\n=== UNMATCHED ===");
for (const u of unmatched) {
  const guess = u.bestGuess ? `(best guess: ${u.bestGuess}, score=${u.bestScore.toFixed(1)})` : "(no candidate)";
  console.log(`  [${u.item.id.toString().padStart(3)}] ${u.item.name.padEnd(45)} ${guess}`);
}

console.log("\n=== UNUSED IMAGES ===");
for (const f of files) if (!usedFiles.has(f)) console.log(`  ${f}`);

const mapping = matches.map(m => ({ id: m.item.id, name: m.item.name, category: m.item.category, file: m.file }));
fs.writeFileSync("scripts/image-mapping.json", JSON.stringify(mapping, null, 2));
console.log(`\nWrote scripts/image-mapping.json (${mapping.length} entries)`);
