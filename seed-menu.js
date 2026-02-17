import { drizzle } from "drizzle-orm/mysql2";
import { menuItems } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

const sampleMenu = [
  {
    name: "Chicken Shish Kebab Wrap",
    description: "Grilled chicken with fresh vegetables in warm flatbread",
    category: "Kebab",
    price: 1800, // $18.00
    imageUrl: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400",
    isAvailable: true,
  },
  {
    name: "Lamb Doner Wrap",
    description: "Slow-cooked lamb with garlic sauce and pickles",
    category: "Kebab",
    price: 1900,
    imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400",
    isAvailable: true,
  },
  {
    name: "Chicken Momo (8 pcs)",
    description: "Handcrafted dumplings with spiced chicken filling",
    category: "Momo",
    price: 1600,
    imageUrl: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400",
    isAvailable: true,
  },
  {
    name: "Vegetable Momo (8 pcs)",
    description: "Fresh vegetable dumplings with traditional spices",
    category: "Momo",
    price: 1400,
    imageUrl: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400",
    isAvailable: true,
  },
  {
    name: "Brown Sugar Bubble Tea",
    description: "Classic milk tea with chewy tapioca pearls",
    category: "Bubble Tea",
    price: 800,
    imageUrl: "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=400",
    isAvailable: true,
  },
  {
    name: "Taro Bubble Tea",
    description: "Creamy taro milk tea with boba",
    category: "Bubble Tea",
    price: 800,
    imageUrl: "https://images.unsplash.com/photo-1558857563-b406f3e3b39c?w=400",
    isAvailable: true,
  },
  {
    name: "Flat White",
    description: "Double shot espresso with velvety microfoam",
    category: "Coffee",
    price: 600,
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400",
    isAvailable: true,
  },
  {
    name: "Long Black",
    description: "Double espresso with hot water",
    category: "Coffee",
    price: 500,
    imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400",
    isAvailable: true,
  },
];

async function seed() {
  console.log("Seeding menu items...");
  
  for (const item of sampleMenu) {
    await db.insert(menuItems).values(item);
  }
  
  console.log(`✓ Seeded ${sampleMenu.length} menu items`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
