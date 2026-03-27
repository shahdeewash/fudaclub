/**
 * Seeds the Square sandbox catalog with FÜDA-style menu items.
 * Uses CATEGORY_ITEM_MEMBERSHIP to properly link items to categories.
 * Run with: SQUARE_TOKEN=<your_sandbox_token> node scripts/seed-square-catalog.mjs
 */
import { SquareClient, SquareEnvironment } from 'square';
import { randomUUID } from 'crypto';

const TOKEN = process.env.SQUARE_TOKEN;
if (!TOKEN) {
  console.error('Error: SQUARE_TOKEN env var required');
  process.exit(1);
}

const client = new SquareClient({
  token: TOKEN,
  environment: SquareEnvironment.Sandbox,
});

const menuData = {
  Mains: [
    { name: 'Pad Thai', description: 'Classic Thai stir-fried noodles with tofu, bean sprouts, peanuts and lime', price: 1450 },
    { name: 'Butter Chicken', description: 'Slow-cooked chicken in a rich tomato and cream sauce, served with basmati rice', price: 1600 },
    { name: 'Beef Rendang', description: 'Slow-braised beef in coconut milk and aromatic spices, served with steamed rice', price: 1750 },
    { name: 'Pho Bo', description: 'Vietnamese beef noodle soup with fresh herbs, bean sprouts and hoisin', price: 1550 },
  ],
  Snacks: [
    { name: 'Chicken Momo', description: 'Steamed Nepalese dumplings filled with spiced chicken, served with tomato chutney', price: 1200 },
    { name: 'Samosa (2 pcs)', description: 'Crispy pastry filled with spiced potato and peas, served with tamarind chutney', price: 900 },
    { name: 'Spring Rolls (3 pcs)', description: 'Crispy Vietnamese-style rolls filled with pork and vegetables', price: 1000 },
  ],
  Drinks: [
    { name: 'Mango Lassi', description: 'Chilled yoghurt drink blended with fresh mango', price: 700 },
    { name: 'Thai Iced Tea', description: 'Strong brewed tea with condensed milk over ice', price: 650 },
    { name: 'Coconut Water', description: 'Fresh chilled coconut water', price: 500 },
  ],
};

async function deleteAll() {
  const page = await client.catalog.list({ types: 'ITEM,CATEGORY' });
  const ids = [];
  for await (const obj of page) ids.push(obj.id);
  if (ids.length > 0) {
    await client.catalog.batchDelete({ objectIds: ids });
    console.log(`Deleted ${ids.length} existing objects.`);
  }
}

async function seed() {
  console.log('Seeding Square sandbox catalog...\n');
  await deleteAll();

  // Step 1: Create categories + items in one batch
  const allObjects = [];
  const catTempIds = {};

  for (const catName of Object.keys(menuData)) {
    const catTempId = `#cat-${catName.toLowerCase()}`;
    catTempIds[catName] = catTempId;
    allObjects.push({
      type: 'CATEGORY',
      id: catTempId,
      categoryData: { name: catName },
    });
  }

  const itemTempIds = {}; // name → tempId
  for (const [catName, items] of Object.entries(menuData)) {
    for (const item of items) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const itemTempId = `#item-${slug}`;
      const varTempId = `#var-${slug}`;
      itemTempIds[item.name] = { itemTempId, catName };
      allObjects.push({
        type: 'ITEM',
        id: itemTempId,
        itemData: {
          name: item.name,
          description: item.description,
          variations: [{
            type: 'ITEM_VARIATION',
            id: varTempId,
            itemVariationData: {
              itemId: itemTempId,
              name: 'Regular',
              pricingType: 'FIXED_PRICING',
              priceMoney: { amount: BigInt(item.price), currency: 'AUD' },
            },
          }],
        },
      });
    }
  }

  const batchResponse = await client.catalog.batchUpsert({
    idempotencyKey: randomUUID(),
    batches: [{ objects: allObjects }],
  });

  // Build temp → real ID maps
  const idMap = new Map();
  for (const m of (batchResponse.idMappings || [])) {
    idMap.set(m.clientObjectId, m.objectId);
  }

  console.log('Created categories and items.');

  // Step 2: Create CATEGORY_ITEM_MEMBERSHIP objects to link items to categories
  const membershipObjects = [];
  for (const [itemName, { itemTempId, catName }] of Object.entries(itemTempIds)) {
    const realItemId = idMap.get(itemTempId);
    const realCatId = idMap.get(catTempIds[catName]);
    if (realItemId && realCatId) {
      membershipObjects.push({
        type: 'CATEGORY_ITEM_MEMBERSHIP',
        id: `#mem-${itemTempId.slice(1)}`,
        categoryItemMembershipData: {
          itemId: realItemId,
          categoryId: realCatId,
        },
      });
    }
  }

  if (membershipObjects.length > 0) {
    await client.catalog.batchUpsert({
      idempotencyKey: randomUUID(),
      batches: [{ objects: membershipObjects }],
    });
    console.log(`Created ${membershipObjects.length} category memberships.`);
  }

  console.log('\n✅ Catalog seeded successfully!');
  console.log('\nCategories and items:');
  for (const [catName, items] of Object.entries(menuData)) {
    console.log(`  📂 ${catName}`);
    for (const item of items) {
      console.log(`     • ${item.name} — $${(item.price / 100).toFixed(2)}`);
    }
  }
  console.log('\nNow go to FÜDA Admin → Menu Management → Sync from Square');
}

seed().catch(e => {
  console.error('Error:', e.message);
  if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
});
