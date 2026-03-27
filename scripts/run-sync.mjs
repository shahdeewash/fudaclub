/**
 * Runs the Square catalog sync directly against the database with full logging.
 * Uses SQUARE_TOKEN env var (sandbox personal access token) or falls back to DB stored token.
 */
import { createConnection } from 'mysql2/promise';
import { SquareClient, SquareEnvironment } from 'square';

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  
  let accessToken = process.env.SQUARE_TOKEN;
  let merchantName = "sandbox test";

  if (!accessToken) {
    // Get stored access token from DB
    const [connRows] = await db.execute('SELECT accessToken, merchantName FROM squareConnections WHERE userId = 1 LIMIT 1');
    if (!connRows.length) { console.log('No Square connection found'); await db.end(); return; }
    accessToken = connRows[0].accessToken;
    merchantName = connRows[0].merchantName;
  }

  console.log('Connected as:', merchantName);
  
  const sqEnv = (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

  const client = new SquareClient({ token: accessToken, environment: sqEnv });
  
  // Fetch all catalog objects including MODIFIER_LIST
  console.log('\nFetching catalog...');
  const page = await client.catalog.list({ types: 'ITEM,ITEM_VARIATION,CATEGORY,IMAGE,MODIFIER_LIST' });
  const allObjects = [];
  for await (const obj of page) allObjects.push(obj);
  console.log('Total objects fetched:', allObjects.length);
  
  // Build lookup maps
  const categoryMap = new Map();
  const imageMap = new Map();
  const modifierListMap = new Map(); // squareId → { name, selectionType, modifiers[] }

  for (const obj of allObjects) {
    if (obj.type === 'CATEGORY' && obj.id) {
      categoryMap.set(obj.id, obj.categoryData?.name ?? 'Other');
    }
    if (obj.type === 'IMAGE' && obj.id && obj.imageData?.url) {
      imageMap.set(obj.id, obj.imageData.url);
    }
    if (obj.type === 'MODIFIER_LIST' && obj.id) {
      modifierListMap.set(obj.id, {
        name: obj.modifierListData?.name,
        selectionType: obj.modifierListData?.selectionType ?? 'SINGLE',
        modifiers: obj.modifierListData?.modifiers ?? [],
      });
    }
  }

  console.log('Categories:', Object.fromEntries(categoryMap));
  console.log('Modifier lists:', [...modifierListMap.entries()].map(([id, v]) => `${id}: ${v.name} (${v.selectionType}, ${v.modifiers.length} options)`));

  // Sync modifier lists first
  let modListsSynced = 0, modsSynced = 0;
  const modifierListDbIdMap = new Map(); // squareId → DB id

  for (const [squareModListId, listData] of modifierListMap) {
    if (!listData.name) continue;
    const selectionType = listData.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE';

    const [existing] = await db.execute(
      'SELECT id FROM modifierLists WHERE squareModifierListId = ? LIMIT 1',
      [squareModListId]
    );

    let listDbId;
    if (existing.length > 0) {
      await db.execute(
        'UPDATE modifierLists SET name=?, selectionType=? WHERE squareModifierListId=?',
        [listData.name, selectionType, squareModListId]
      );
      listDbId = existing[0].id;
      console.log(`  Modifier list updated: ${listData.name} (id=${listDbId})`);
    } else {
      const [ins] = await db.execute(
        'INSERT INTO modifierLists (squareModifierListId, name, selectionType) VALUES (?, ?, ?)',
        [squareModListId, listData.name, selectionType]
      );
      listDbId = ins.insertId;
      modListsSynced++;
      console.log(`  Modifier list created: ${listData.name} (id=${listDbId})`);
    }
    modifierListDbIdMap.set(squareModListId, listDbId);

    // Upsert modifiers
    for (const mod of listData.modifiers) {
      if (!mod.id || !mod.modifierData?.name) continue;
      const priceInCents = mod.modifierData.priceMoney?.amount ? Number(mod.modifierData.priceMoney.amount) : 0;
      const ordinal = mod.modifierData.ordinal ?? 0;

      const [existingMod] = await db.execute(
        'SELECT id FROM modifiers WHERE squareModifierId = ? LIMIT 1',
        [mod.id]
      );

      if (existingMod.length > 0) {
        await db.execute(
          'UPDATE modifiers SET name=?, priceInCents=?, ordinal=? WHERE squareModifierId=?',
          [mod.modifierData.name, priceInCents, ordinal, mod.id]
        );
      } else {
        await db.execute(
          'INSERT INTO modifiers (squareModifierId, modifierListId, name, priceInCents, ordinal) VALUES (?, ?, ?, ?, ?)',
          [mod.id, listDbId, mod.modifierData.name, priceInCents, ordinal]
        );
        modsSynced++;
      }
    }
  }

  console.log(`\nModifier lists synced: ${modListsSynced} new, modifiers: ${modsSynced} new`);

  // Process items
  let imported = 0, updated = 0, skipped = 0;
  
  for (const obj of allObjects) {
    if (obj.type !== 'ITEM') continue;
    
    const itemData = obj.itemData;
    if (!itemData?.name) { skipped++; continue; }
    
    const firstVariation = itemData.variations?.[0];
    const priceMoney = firstVariation?.itemVariationData?.priceMoney;
    const priceInCents = priceMoney?.amount ? Number(priceMoney.amount) : 0;
    
    if (priceInCents === 0) { console.log('Skip (no price):', itemData.name); skipped++; continue; }
    
    let categoryName = 'Other';
    if (itemData.categoryId) {
      categoryName = categoryMap.get(itemData.categoryId) ?? 'Other';
    } else if (itemData.categories && itemData.categories.length > 0) {
      categoryName = categoryMap.get(itemData.categories[0].id) ?? 'Other';
    }
    
    const imageUrl = itemData.imageIds?.[0] ? (imageMap.get(itemData.imageIds[0]) ?? null) : null;
    const squareCatalogId = obj.id;
    
    console.log(`\nItem: ${itemData.name} | $${priceInCents/100} | ${categoryName}`);
    
    let menuItemDbId;
    const [existing] = await db.execute(
      'SELECT id FROM menuItems WHERE squareCatalogId = ? LIMIT 1',
      [squareCatalogId]
    );
    
    if (existing.length > 0) {
      await db.execute(
        'UPDATE menuItems SET name=?, description=?, category=?, price=?, imageUrl=? WHERE squareCatalogId=?',
        [itemData.name, itemData.description ?? null, categoryName, priceInCents, imageUrl, squareCatalogId]
      );
      menuItemDbId = existing[0].id;
      updated++;
      console.log(`  → Updated (id=${menuItemDbId})`);
    } else {
      const [ins] = await db.execute(
        'INSERT INTO menuItems (squareCatalogId, name, description, category, price, imageUrl, isAvailable, isTodaysSpecial, sortOrder) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)',
        [squareCatalogId, itemData.name, itemData.description ?? null, categoryName, priceInCents, imageUrl]
      );
      menuItemDbId = ins.insertId;
      imported++;
      console.log(`  → Inserted (id=${menuItemDbId})`);
    }

    // Link modifier lists
    const modLinks = itemData.modifierListInfo ?? [];
    if (modLinks.length > 0) {
      await db.execute('DELETE FROM menuItemModifierLists WHERE menuItemId = ?', [menuItemDbId]);
      for (const link of modLinks) {
        const listDbId = modifierListDbIdMap.get(link.modifierListId);
        if (!listDbId) { console.log(`  → Modifier list not found: ${link.modifierListId}`); continue; }
        await db.execute(
          'INSERT INTO menuItemModifierLists (menuItemId, modifierListId, isEnabled) VALUES (?, ?, ?)',
          [menuItemDbId, listDbId, link.enabled !== false ? 1 : 0]
        );
        const ml = modifierListMap.get(link.modifierListId);
        console.log(`  → Linked modifier list: ${ml?.name ?? link.modifierListId}`);
      }
    }
  }
  
  await db.end();
  console.log(`\nSync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`);
  console.log(`Modifier lists: ${modListsSynced} new, modifiers: ${modsSynced} new`);
}

main().catch(e => console.error('Fatal error:', e.message, e));
