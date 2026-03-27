import { createConnection } from 'mysql2/promise';
import { SquareClient, SquareEnvironment } from 'square';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SELECT accessToken FROM squareConnections WHERE userId = 1 LIMIT 1');
  await conn.end();
  
  const { accessToken } = rows[0];
  const client = new SquareClient({ token: accessToken, environment: SquareEnvironment.Sandbox });
  
  // Use the REST API directly to get full item data with category_id
  const response = await fetch('https://connect.squareupsandbox.com/v2/catalog/list?types=ITEM', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  });
  
  const data = await response.json();
  const firstItem = data.objects?.[0];
  if (firstItem) {
    console.log('Full REST API item structure:');
    console.log(JSON.stringify(firstItem, null, 2));
  }
}

main().catch(e => console.error('Error:', e.message));
