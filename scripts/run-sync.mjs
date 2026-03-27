/**
 * Runs the Square catalog sync directly against the database with full logging.
 */
import { createConnection } from 'mysql2/promise';
import { SquareClient, SquareEnvironment } from 'square';

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  
  // Get stored access token
  const [connRows] = await db.execute('SELECT accessToken, merchantName FROM squareConnections WHERE userId = 1 LIMIT 1');
  if (!connRows.length) { console.log('No Square connection found'); await db.end(); return; }
  
  const { accessToken, merchantName } = connRows[0];
  console.log('Connected as:', merchantName);
  
  const client = new SquareClient({ token: accessToken, environment: SquareEnvironment.Sandbox });
  
  // Fetch all catalog objects
  console.log('\nFetching catalog...');
  const page = await client.catalog.list({ types: 'ITEM,ITEM_VARIATION,CATEGORY,IMAGE' });
  const allObjects = [];
  for await (const obj of page) allObjects.push(obj);
  console.log('Total objects fetched:', allObjects.length);
  
  // Build category map
  const categoryMap = new Map();
  for (const obj of allObjects) {
    if (obj.type === 'CATEGORY' && obj.id) {
      categoryMap.set(obj.id, obj.categoryData?.name ?? 'Other');
    }
  }
  console.log('Categories:', Object.fromEntries(categoryMap));
  
  // Process items
  let imported = 0, updated = 0, skipped = 0;
  
  for (const obj of allObjects) {
    if (obj.type !== 'ITEM') continue;
    
    const itemData = obj.itemData;
    if (!itemData?.name) { console.log('Skip (no name):', obj.id); skipped++; continue; }
    
    const firstVariation = itemData.variations?.[0];
    const priceMoney = firstVariation?.itemVariationData?.priceMoney;
    const priceInCents = priceMoney?.amount ? Number(priceMoney.amount) : 0;
    
    if (priceInCents === 0) { console.log('Skip (no price):', itemData.name); skipped++; continue; }
    
    // Try to get category - check both categoryId and categories array
    let categoryName = 'Other';
    if (itemData.categoryId) {
      categoryName = categoryMap.get(itemData.categoryId) ?? 'Other';
    } else if (itemData.categories && itemData.categories.length > 0) {
      const catId = itemData.categories[0].id;
      categoryName = categoryMap.get(catId) ?? 'Other';
    }
    
    const squareCatalogId = obj.id;
    
    console.log(`Processing: ${itemData.name} | price: ${priceInCents} | category: ${categoryName} | id: ${squareCatalogId}`);
    
    try {
      // Check if exists
      const [existing] = await db.execute('SELECT id FROM menuItems WHERE squareCatalogId = ? LIMIT 1', [squareCatalogId]);
      
      if (existing.length > 0) {
        await db.execute(
          'UPDATE menuItems SET name=?, description=?, category=?, price=? WHERE squareCatalogId=?',
          [itemData.name, itemData.description ?? null, categoryName, priceInCents, squareCatalogId]
        );
        console.log('  → Updated');
        updated++;
      } else {
        await db.execute(
          'INSERT INTO menuItems (squareCatalogId, name, description, category, price, isAvailable, isTodaysSpecial, sortOrder) VALUES (?, ?, ?, ?, ?, 1, 0, 0)',
          [squareCatalogId, itemData.name, itemData.description ?? null, categoryName, priceInCents]
        );
        console.log('  → Inserted');
        imported++;
      }
    } catch (err) {
      console.error('  → DB ERROR:', err.message);
    }
  }
  
  await db.end();
  console.log(`\nSync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`);
}

main().catch(e => console.error('Fatal error:', e.message, e.stack));
