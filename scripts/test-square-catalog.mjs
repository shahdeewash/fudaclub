import { SquareClient, SquareEnvironment } from 'square';

// Use the access token from the DB (the one stored after OAuth)
// Token from DB: EAAAl7W7tC0a4ppapA1D... (first 20 chars shown)
// We need the full token - let's use the personal access token to test catalog
const TOKEN = process.env.SQUARE_SANDBOX_TOKEN || process.env.SQUARE_APPLICATION_SECRET || '';

async function main() {
  console.log('Testing with token prefix:', TOKEN.substring(0, 20));
  
  const client = new SquareClient({
    token: TOKEN,
    environment: SquareEnvironment.Sandbox,
  });

  try {
    // Try listing catalog
    console.log('\n--- Listing all catalog objects ---');
    const page = await client.catalog.list({});
    const items = [];
    for await (const obj of page) {
      items.push(obj);
    }
    console.log('Total objects:', items.length);
    if (items.length > 0) {
      console.log('Types found:', [...new Set(items.map(i => i.type))]);
      console.log('First item:', JSON.stringify(items[0], null, 2).substring(0, 500));
    }

    // Try with types filter
    console.log('\n--- Listing ITEM type only ---');
    const page2 = await client.catalog.list({ types: 'ITEM' });
    const items2 = [];
    for await (const obj of page2) {
      items2.push(obj);
    }
    console.log('ITEM objects:', items2.length);

  } catch (err) {
    console.error('Error:', err.message);
    if (err.errors) console.error('Errors:', JSON.stringify(err.errors, null, 2));
  }
}

main();
