import { createConnection } from 'mysql2/promise';
import { SquareClient, SquareEnvironment } from 'square';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SELECT accessToken FROM squareConnections WHERE userId = 1 LIMIT 1');
  await conn.end();
  
  const { accessToken } = rows[0];
  const client = new SquareClient({ token: accessToken, environment: SquareEnvironment.Sandbox });
  
  const page = await client.catalog.list({ types: 'ITEM,CATEGORY' });
  const objects = [];
  for await (const obj of page) objects.push(obj);
  
  // Show raw structure of first ITEM
  const firstItem = objects.find(o => o.type === 'ITEM');
  if (firstItem) {
    // Safely stringify with BigInt support
    const safe = JSON.parse(JSON.stringify(firstItem, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    console.log('First ITEM raw structure:');
    console.log(JSON.stringify(safe, null, 2));
  }
  
  // Show categories
  const cats = objects.filter(o => o.type === 'CATEGORY');
  console.log('\nCategories:');
  for (const c of cats) {
    const safe = JSON.parse(JSON.stringify(c, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    console.log(JSON.stringify(safe));
  }
}

main().catch(e => console.error('Error:', e.message));
