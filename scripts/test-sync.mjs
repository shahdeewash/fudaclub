/**
 * Tests the Square catalog sync directly using the stored access token from DB.
 */
import { createConnection } from 'mysql2/promise';
import { SquareClient, SquareEnvironment } from 'square';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  
  // Get the stored access token
  const [rows] = await conn.execute('SELECT accessToken, merchantId, merchantName FROM squareConnections WHERE userId = 1 LIMIT 1');
  await conn.end();
  
  if (!rows.length) {
    console.log('No Square connection found for userId 1');
    return;
  }
  
  const { accessToken, merchantName } = rows[0];
  console.log('Connected merchant:', merchantName);
  console.log('Token prefix:', accessToken.substring(0, 20));
  
  const client = new SquareClient({ token: accessToken, environment: SquareEnvironment.Sandbox });
  
  // List all catalog objects
  console.log('\nFetching catalog...');
  const page = await client.catalog.list({ types: 'ITEM,ITEM_VARIATION,CATEGORY,IMAGE' });
  const objects = [];
  for await (const obj of page) {
    objects.push(obj);
  }
  
  console.log('Total objects:', objects.length);
  const byType = {};
  for (const obj of objects) {
    byType[obj.type] = (byType[obj.type] || 0) + 1;
  }
  console.log('By type:', byType);
  
  // Show items
  const items = objects.filter(o => o.type === 'ITEM');
  console.log('\nItems found:', items.length);
  for (const item of items) {
    const name = item.itemData?.name || '?';
    const variations = item.itemData?.variations || [];
    const price = variations[0]?.itemVariationData?.priceMoney?.amount;
    console.log(`  - ${name}: $${price ? Number(price) / 100 : '?'}`);
  }
}

main().catch(e => console.error('Error:', e.message));
