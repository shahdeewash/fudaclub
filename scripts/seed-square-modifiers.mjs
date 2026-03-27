/**
 * Seeds the Square sandbox catalog with modifier lists and links them to existing items.
 * Run with: SQUARE_TOKEN=<sandbox_personal_access_token> node scripts/seed-square-modifiers.mjs
 */

const TOKEN = process.env.SQUARE_TOKEN;
const BASE = "https://connect.squareupsandbox.com";

async function sq(path, body) {
  const res = await fetch(`${BASE}/v2${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-01-18",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function listCatalog(types) {
  const res = await fetch(`${BASE}/v2/catalog/list?types=${types}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Square-Version": "2024-01-18" },
  });
  return res.json();
}

// 1. Create modifier lists
console.log("Creating modifier lists...");

const modifierBatch = await sq("/catalog/batch-upsert", {
  idempotency_key: `fuda-modifiers-${Date.now()}`,
  batches: [
    {
      objects: [
        // Spice Level (SINGLE select)
        {
          type: "MODIFIER_LIST",
          id: "#spice-level",
          modifier_list_data: {
            name: "Spice Level",
            selection_type: "SINGLE",
            modifiers: [
              { type: "MODIFIER", id: "#spice-mild",   modifier_data: { name: "Mild",     price_money: { amount: 0,   currency: "AUD" }, ordinal: 1 } },
              { type: "MODIFIER", id: "#spice-medium", modifier_data: { name: "Medium",   price_money: { amount: 0,   currency: "AUD" }, ordinal: 2 } },
              { type: "MODIFIER", id: "#spice-hot",    modifier_data: { name: "Hot",      price_money: { amount: 0,   currency: "AUD" }, ordinal: 3 } },
              { type: "MODIFIER", id: "#spice-xhot",   modifier_data: { name: "Extra Hot",price_money: { amount: 0,   currency: "AUD" }, ordinal: 4 } },
            ],
          },
        },
        // Extras (MULTIPLE select)
        {
          type: "MODIFIER_LIST",
          id: "#extras",
          modifier_list_data: {
            name: "Extras",
            selection_type: "MULTIPLE",
            modifiers: [
              { type: "MODIFIER", id: "#extra-rice",     modifier_data: { name: "Extra Rice",     price_money: { amount: 150, currency: "AUD" }, ordinal: 1 } },
              { type: "MODIFIER", id: "#extra-protein",  modifier_data: { name: "Extra Protein",  price_money: { amount: 300, currency: "AUD" }, ordinal: 2 } },
              { type: "MODIFIER", id: "#extra-sauce",    modifier_data: { name: "Extra Sauce",    price_money: { amount: 100, currency: "AUD" }, ordinal: 3 } },
              { type: "MODIFIER", id: "#extra-veg",      modifier_data: { name: "Extra Veggies",  price_money: { amount: 150, currency: "AUD" }, ordinal: 4 } },
            ],
          },
        },
        // Drink Size (SINGLE select)
        {
          type: "MODIFIER_LIST",
          id: "#drink-size",
          modifier_list_data: {
            name: "Size",
            selection_type: "SINGLE",
            modifiers: [
              { type: "MODIFIER", id: "#size-regular", modifier_data: { name: "Regular", price_money: { amount: 0,   currency: "AUD" }, ordinal: 1 } },
              { type: "MODIFIER", id: "#size-large",   modifier_data: { name: "Large",   price_money: { amount: 100, currency: "AUD" }, ordinal: 2 } },
            ],
          },
        },
      ],
    },
  ],
});

// Get the real IDs from the response — Square returns an array of {client_object_id, object_id}
const idMap = {};
for (const mapping of (modifierBatch.id_mappings ?? [])) {
  idMap[mapping.client_object_id] = mapping.object_id;
}
console.log("ID mappings:", idMap);

const spiceLevelId = idMap["#spice-level"];
const extrasId = idMap["#extras"];
const drinkSizeId = idMap["#drink-size"];

console.log("Modifier lists created:", { spiceLevelId, extrasId, drinkSizeId });

// 2. Fetch existing items
const catalog = await listCatalog("ITEM");
const items = (catalog.objects ?? []).filter(o => o.type === "ITEM");
console.log(`Found ${items.length} items to link modifiers to`);

// 3. Link modifier lists to items
// Mains get spice level + extras; Drinks get size
const mainNames = ["Pad Thai", "Butter Chicken", "Beef Rendang", "Pho Bo"];
const snackNames = ["Chicken Momo", "Samosa (2 pcs)", "Spring Rolls (3 pcs)"];
const drinkNames = ["Mango Lassi", "Thai Iced Tea", "Coconut Water"];

const updateObjects = items.map(item => {
  const name = item.item_data?.name ?? "";
  let modifierListInfo = [];

  if (mainNames.includes(name)) {
    modifierListInfo = [
      { modifier_list_id: spiceLevelId, enabled: true, min_selected_modifiers: 0, max_selected_modifiers: 1 },
      { modifier_list_id: extrasId, enabled: true, min_selected_modifiers: 0, max_selected_modifiers: -1 },
    ];
  } else if (snackNames.includes(name)) {
    modifierListInfo = [
      { modifier_list_id: spiceLevelId, enabled: true, min_selected_modifiers: 0, max_selected_modifiers: 1 },
    ];
  } else if (drinkNames.includes(name)) {
    modifierListInfo = [
      { modifier_list_id: drinkSizeId, enabled: true, min_selected_modifiers: 0, max_selected_modifiers: 1 },
    ];
  }

  return {
    ...item,
    item_data: {
      ...item.item_data,
      modifier_list_info: modifierListInfo,
    },
  };
});

const updateResult = await sq("/catalog/batch-upsert", {
  idempotency_key: `fuda-modifier-links-${Date.now()}`,
  batches: [{ objects: updateObjects }],
});

console.log(`Updated ${updateResult.objects?.length ?? 0} items with modifier links`);
console.log("Done! Now run Sync from Square in the admin panel.");
