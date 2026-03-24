/**
 * FÜDA Real Menu Seed Script
 * Seeds the database with real menu items from FÜDA DoorDash listing
 * Run: node seed-menu.mjs
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Real FÜDA menu items from DoorDash
// Images from DoorDash CDN (actual FÜDA food photos)
const FUDA_MENU = [
  // ── KEBAB MAINS ──────────────────────────────────────────────────────────────
  {
    name: 'Lamb Meatball with Rice',
    description: 'Savory lamb meatballs served over fluffy rice, drizzled with a rich, aromatic sauce.',
    price: 2299,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/25aed998-4d82-4a6b-8888-11182b72a4f6-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Iskender Kebab',
    description: 'Succulent lamb slices served over warm pita, topped with rich tomato sauce and butter.',
    price: 2199,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/337fd097-87e8-4f9d-91a0-9dee391a997c-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Doner Main',
    description: 'Succulent doner meat served with fresh vegetables and flavorful sauces, wrapped in warm pita bread.',
    price: 2299,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/ee9160ea-226d-47d0-a9da-5affd1afe3d0-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Mixed Grill Kebab',
    description: 'Chicken doner with pilaf rice and mixed grill — a feast of flavours on one plate.',
    price: 2999,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Chicken Shish Kebab',
    description: 'Succulent chicken marinated in spices, grilled to perfection, served with fresh salad.',
    price: 2199,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/309bbae7-34f5-4da6-96ae-a54baff67708-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Lamb Shish Kebab',
    description: 'Succulent lamb marinated in spices, grilled to perfection, served with fresh salad.',
    price: 2499,
    category: 'Kebab Mains',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7858799b-7119-4ed8-85ba-2086dcd4170b-retina-large.jpg',
    isAvailable: true,
  },

  // ── KEBAB WRAPS ──────────────────────────────────────────────────────────────
  {
    name: 'Chicken Doner Wrap',
    description: 'Tender, marinated chicken, shaved from the spit, with fresh salad and zesty sauce.',
    price: 1799,
    category: 'Kebab Wraps',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/6e7ab9e4-996a-4cc2-9264-0147945f8ed5-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Chicken Shish Wrap',
    description: 'Tender marinated chicken, fire-grilled on a skewer, wrapped in warm pita with fresh salad.',
    price: 1899,
    category: 'Kebab Wraps',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/309bbae7-34f5-4da6-96ae-a54baff67708-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Lamb Shish Wrap',
    description: 'Succulent cubes of marinated lamb, fire-grilled on a skewer, wrapped in warm pita with fresh salad and zesty sauce.',
    price: 1999,
    category: 'Kebab Wraps',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7858799b-7119-4ed8-85ba-2086dcd4170b-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Kofta Wrap',
    description: 'Seasoned ground meat kebab wrapped in warm pita with fresh salad and house sauce.',
    price: 1899,
    category: 'Kebab Wraps',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/337fd097-87e8-4f9d-91a0-9dee391a997c-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Falafel and Haloumi Wrap',
    description: 'Crispy falafel and grilled haloumi wrapped in warm pita with fresh salad and tahini sauce.',
    price: 1799,
    category: 'Kebab Wraps',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },

  // ── MOMO (Full Portions) ─────────────────────────────────────────────────────
  {
    name: 'Chicken Momo',
    description: 'Juicy ground chicken spiced with herbs, wrapped in delicate dough, and perfectly steamed. Served with tangy dipping sauce.',
    price: 1800,
    category: 'Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/75fc6cb9-8c8c-4143-978d-c859fe835b9d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Buff Momo',
    description: 'Savory buff momo dumplings, steamed to perfection and served with a spicy dipping sauce.',
    price: 2000,
    category: 'Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8abfcb13-f120-4fad-b136-98216e58c803-retina-large.jpg',
    isAvailable: true,
  },

  // ── 6 MOMO ENTREE ────────────────────────────────────────────────────────────
  {
    name: 'Chicken Momo (6pcs)',
    description: 'Steamed dumplings filled with seasoned chicken, served with a tangy dipping sauce.',
    price: 1290,
    category: '6 Momo Entree',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/59889c2d-1d12-4211-8ed6-4fd994296bff-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Buff Momo (6pcs)',
    description: 'Deliciously spiced buffalo meat dumplings, steamed to perfection, served with a tangy dipping sauce.',
    price: 1490,
    category: '6 Momo Entree',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8abfcb13-f120-4fad-b136-98216e58c803-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Paneer Momo (6pcs)',
    description: 'Soft, spiced paneer dumplings, steamed or fried, served with dipping sauce.',
    price: 1390,
    category: '6 Momo Entree',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/75fc6cb9-8c8c-4143-978d-c859fe835b9d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Vegetarian Momo (6pcs)',
    description: 'Delicious vegetarian momos filled with fresh vegetables, served with a tangy dipping sauce.',
    price: 1190,
    category: '6 Momo Entree',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/59889c2d-1d12-4211-8ed6-4fd994296bff-retina-large.jpg',
    isAvailable: true,
  },

  // ── SPECIAL MOMO ─────────────────────────────────────────────────────────────
  {
    name: 'Chicken Momo Platter',
    description: 'Delicious steamed chicken momos served with spicy dipping sauce, perfect for sharing or enjoying solo.',
    price: 2799,
    category: 'Special Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/75fc6cb9-8c8c-4143-978d-c859fe835b9d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Paneer Momo Platter',
    description: 'Soft, spiced paneer dumplings, steamed or fried, served with dipping sauce. Perfect for sharing.',
    price: 2999,
    category: 'Special Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/59889c2d-1d12-4211-8ed6-4fd994296bff-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Buff Momo Platter',
    description: 'Savor our Buff Momo Platter, featuring tender dumplings filled with spiced buffalo meat and herbs.',
    price: 3099,
    category: 'Special Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8abfcb13-f120-4fad-b136-98216e58c803-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Lhaphing',
    description: 'A chilled, savory mung bean noodle dish with chili oil, vinegar, and crunch. A Tibetan street food classic.',
    price: 1000,
    category: 'Special Momo',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },

  // ── ENTREES ──────────────────────────────────────────────────────────────────
  {
    name: 'Trio of Dip',
    description: 'A delightful platter of Hummus, Tzatziki, and Carrot Dip, served with warm pita bread.',
    price: 1900,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Hummus with Pita Bread',
    description: 'Warm, fluffy pita bread paired with creamy, authentic hummus, drizzled with olive oil.',
    price: 900,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Tzatziki with Pita Bread',
    description: 'Zesty Greek yogurt dip with cucumber, garlic, and fresh dill, served with warm pita bread.',
    price: 900,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Mediterranean Salad',
    description: 'Crisp greens, ripe tomatoes, cucumber, Kalamata olives, and feta cheese with a light dressing.',
    price: 799,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/25aed998-4d82-4a6b-8888-11182b72a4f6-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Lamb Spring Roll',
    description: 'Tender, seasoned lamb and fresh vegetables wrapped in a crispy golden roll.',
    price: 699,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7858799b-7119-4ed8-85ba-2086dcd4170b-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Chicken Spring Roll',
    description: 'Tender shredded chicken and fresh vegetables, perfectly seasoned and wrapped in a crispy roll.',
    price: 699,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/309bbae7-34f5-4da6-96ae-a54baff67708-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Spinach and Fetta Spring Roll',
    description: 'Savory spinach and creamy feta cheese, encased in a crispy, golden spring roll wrapper.',
    price: 599,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Samosa',
    description: 'Crispy, flaky pastry filled with spiced potatoes, peas, and herbs. Served with mint chutney.',
    price: 999,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Pita Bread',
    description: 'Warm, freshly baked flatbread, light and fluffy, perfect for dipping into hummus or scooping up salad.',
    price: 400,
    category: 'Entrees',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg',
    isAvailable: true,
  },

  // ── BUBBLE TEA & DRINKS ──────────────────────────────────────────────────────
  {
    name: 'Bubble Tea',
    description: 'Classic bubble tea with chewy tapioca pearls. Choose your flavour — milk tea, taro, matcha and more.',
    price: 790,
    category: 'Bubble Tea',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Mango Pomelo Sago',
    description: 'Chilled coconut milk, fresh mango, sweet pomelo, and chewy sago pearls. A refreshing tropical dessert.',
    price: 790,
    category: 'Fruit Teas & Refreshers',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Lychee Rose Oolong',
    description: 'Fragrant oolong tea infused with sweet lychee and delicate rose. Light, floral, and refreshing.',
    price: 790,
    category: 'Fruit Teas & Refreshers',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Vietnamese Boba Coffee',
    description: 'Strong, sweet Vietnamese coffee combined with chewy boba pearls. A bold and indulgent treat.',
    price: 890,
    category: 'Bubble Coffee',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg',
    isAvailable: true,
  },

  // ── COFFEE ───────────────────────────────────────────────────────────────────
  {
    name: 'Flat White',
    description: 'A smooth, velvety espresso with steamed milk. The perfect balance of coffee and cream.',
    price: 450,
    category: 'Coffee',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Latte',
    description: 'Smooth espresso with steamed milk and a light layer of foam.',
    price: 450,
    category: 'Coffee',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Cappuccino',
    description: 'Rich espresso topped with velvety steamed milk and a generous layer of foam.',
    price: 450,
    category: 'Coffee',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg',
    isAvailable: true,
  },
  {
    name: 'Long Black',
    description: 'Bold, rich espresso shots poured over hot water. Strong and aromatic.',
    price: 450,
    category: 'Coffee',
    imageUrl: 'https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg',
    isAvailable: true,
  },
];

async function seedMenu() {
  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected to database');

  try {
    // Clear existing menu items
    await conn.execute('DELETE FROM menuItems');
    console.log('Cleared existing menu items');

    // Insert new menu items
    let count = 0;
    for (const item of FUDA_MENU) {
      await conn.execute(
        `INSERT INTO menuItems (name, description, price, category, imageUrl, isAvailable, isTodaysSpecial, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [item.name, item.description, item.price, item.category, item.imageUrl, item.isAvailable ? 1 : 0]
      );
      count++;
      console.log(`  ✓ ${item.name} (${item.category}) - $${(item.price / 100).toFixed(2)}`);
    }

    console.log(`\n✅ Successfully seeded ${count} menu items`);
  } catch (err) {
    console.error('Error seeding menu:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

seedMenu().catch(console.error);
