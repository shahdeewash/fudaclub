import { createConnection } from 'mysql2/promise';
import { randomBytes } from 'crypto';
import { URL } from 'url';

function nanoid() {
  return randomBytes(10).toString('base64url');
}

// Read DATABASE_URL from env
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Use DoorDash CDN URLs directly - they are publicly accessible

// Full menu data scraped from DoorDash
const menuItems = [
  // Kebab Mains
  { name: "Lamb Shish Kebab", desc: "Succulent lamb marinated in spices, grilled to perfection, served with fresh vegetables and tangy sauce.", price: 24.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/309bbae7-34f5-4da6-96ae-a54baff67708-retina-large.jpg" },
  { name: "Lamb Meatball with Rice", desc: "Savory lamb meatballs served over fluffy rice, drizzled with a rich, aromatic sauce.", price: 22.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/25aed998-4d82-4a6b-8888-11182b72a4f6-retina-large.jpg" },
  { name: "Kofta Main", desc: "Succulent spiced meatballs served with aromatic herbs, rich sauce, and warm pita bread.", price: 22.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/175e0f71-c8e3-4676-be45-25a4ab127357-retina-large.jpg" },
  { name: "Iskender Kebab", desc: "Succulent lamb slices served over warm pita, topped with rich tomato sauce and creamy yogurt.", price: 21.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/238f150e-6d56-42e0-98a7-41cd648dc9a2-retina-large.jpg" },
  { name: "Doner Main", desc: "Succulent doner meat served with fresh vegetables and flavorful sauces, wrapped in warm pita bread.", price: 22.99, category: "Kebab Mains", imgUrl: null },
  { name: "Mixed Grill Kebab", desc: "Chicken Shish, Kofta, lamb and chicken doner with pilaf rice and salad.", price: 29.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/1db7f8ea-914b-45a9-a4b2-20961cb05f23-retina-large.jpg" },
  { name: "Chicken Shish Kebab", desc: "Succulent chicken marinated in spices, grilled to perfection, served with fresh vegetables and tangy sauce.", price: 21.99, category: "Kebab Mains", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/b24249e6-477f-4360-8603-c832c38f1fe9-retina-large.jpg" },

  // 6 MOMO Entree
  { name: "Chicken Momo (6pcs)", desc: "Steamed dumplings filled with seasoned chicken, served with a tangy dipping sauce. Enjoy six pieces!", price: 12.90, category: "6 MOMO Entree", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/59889c2d-1d12-4211-8ed6-4fd994296bff-retina-large.jpg" },
  { name: "Buff Momo (6pcs)", desc: "Deliciously spiced buffalo meat dumplings, steamed to perfection, served with a tangy dipping sauce.", price: 14.90, category: "6 MOMO Entree", imgUrl: null },
  { name: "Paneer Momo (6pcs)", desc: "Delicious steamed dumplings filled with spiced paneer, served with tangy dipping sauce. Enjoy six pieces!", price: 13.90, category: "6 MOMO Entree", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/9c83e122-2b83-49d9-923d-21777d26a02c-retina-large.jpg" },
  { name: "Vegetarian Momo (6pcs)", desc: "Delicious vegetarian momos filled with fresh vegetables, served with a tangy dipping sauce.", price: 11.90, category: "6 MOMO Entree", imgUrl: null },
  { name: "Vegan Momo (6pcs)", desc: "Delicious vegan momos, steamed to perfection, filled with fresh vegetables and aromatic spices.", price: 11.90, category: "6 MOMO Entree", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/9349d77f-0baa-40b2-ad4c-479fc7fc9e1c-retina-large.jpg" },

  // Coffee
  { name: "Macchiato", desc: "Rich espresso topped with a dollop of creamy foam, delivering a bold and smooth coffee experience.", price: 4.00, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/1c2ce832-6d0b-48c3-a3ea-feaa995e95fd-retina-large.jpg" },
  { name: "Mocha", desc: "Rich espresso blended with steamed milk and velvety chocolate, topped with whipped cream. Indulge!", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/f0c2235f-cb45-4384-a15a-f106ea079b87-retina-large.jpg" },
  { name: "Flat White", desc: "A velvety espresso-based coffee drink, topped with creamy microfoam for a rich, smooth experience.", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/c91e9178-346f-4bd2-a36e-e8550281a6b6-retina-large.jpg" },
  { name: "Hot Chocolate", desc: "Rich, creamy hot chocolate topped with whipped cream and a sprinkle of cocoa for indulgent warmth.", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/13612e7b-fc5d-4c47-9a35-f60c6ee19b6b-retina-large.jpg" },
  { name: "Long Black", desc: "Rich, bold espresso topped with a layer of velvety crema, served hot for a perfect experience.", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/cf9daf4e-a75b-4212-8792-caf82d4d68c2-retina-large.jpg" },
  { name: "Espresso", desc: "Rich, bold coffee brewed by forcing hot water through finely-ground coffee, delivering intense flavor and aroma.", price: 4.00, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/f1580d11-7872-4560-a24a-9bc4c8bf6e79-retina-large.jpg" },
  { name: "Piccolo", desc: "A small, intense espresso-based coffee with a rich, smooth flavour and velvety microfoam.", price: 4.00, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/db3d2fea-342b-4c15-b70d-a7f6b4288e0b-retina-large.jpg" },
  { name: "Dirty Chai Latte", desc: "A rich blend of spiced chai tea and espresso, topped with creamy froth for indulgent warmth.", price: 4.50, category: "Coffee", imgUrl: null },
  { name: "Latte", desc: "Rich espresso blended with steamed milk, topped with velvety foam for a creamy, indulgent experience.", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/34fc6a15-e998-4a78-8a22-fc29010d6395-retina-large.jpg" },
  { name: "Cappuccino", desc: "Rich espresso topped with velvety steamed milk and a light dusting of cocoa. Perfectly balanced.", price: 4.50, category: "Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/c52a7404-9d3b-450b-9f83-3c4269006882-retina-large.jpg" },

  // Fuda Combo
  { name: "#6 Family Feast", desc: "Any 2 Entree + 2×10pc steam momo + any kebab main excluding mix grill and 2× regular bubble tea.", price: 69.90, category: "Fuda Combo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/246581e0-5c00-4e70-ba93-fee811c42450-retina-large.jpg" },
  { name: "#5 Dinner For Two", desc: "10pc steam momo + any kebab main excluding mix grill and 2× regular bubble tea.", price: 39.90, category: "Fuda Combo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/ab4d3bf5-5b19-4f94-b770-116949df85c7-retina-large.jpg" },
  { name: "#4 Mixed Grill Bubble", desc: "Mixed grill with regular bubble tea.", price: 34.90, category: "Fuda Combo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/a63b5820-a5d6-4913-8577-f567a3a2148a-retina-large.jpg" },
  { name: "#3 Kebab Plate Bubble", desc: "Any kebab main excluding mix grill with any regular bubble tea.", price: 27.90, category: "Fuda Combo", imgUrl: null },
  { name: "#1 Momo Bubble Meal", desc: "10pc chicken steam momo with any regular bubble tea.", price: 25.90, category: "Fuda Combo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d4817a5c-de59-4483-9223-2e0954e93c80-retina-large.jpg" },
  { name: "#2 Wrap Bubble Meal", desc: "Any wrap with any regular bubble tea.", price: 24.90, category: "Fuda Combo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d9df702b-3c2a-4bef-9aa1-8a3b791b1d39-retina-large.jpg" },

  // Fruit Teas & Refreshers
  { name: "Mango Pomelo Sago", desc: "Chilled coconut milk, fresh mango, sweet pomelo, and chewy sago pearls. A refreshing tropical dessert.", price: 7.90, category: "Fruit Teas & Refreshers", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/6e7ab9e4-996a-4cc2-9264-0147945f8ed5-retina-large.jpg" },
  { name: "Passionfruit Pineapple Green", desc: "Zesty passionfruit, sweet pineapple, and refreshing green tea, perfectly blended for a vibrant, tropical, sparkling delight.", price: 7.90, category: "Fruit Teas & Refreshers", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/ba8a8d25-1202-45f9-b423-ff129e77ab9d-retina-large.jpg" },
  { name: "Lychee Rose Oolong", desc: "Fragrant oolong, infused with sweet lychee and delicate rose. Light, floral, and perfectly refreshing.", price: 7.90, category: "Fruit Teas & Refreshers", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7858799b-7119-4ed8-85ba-2086dcd4170b-retina-large.jpg" },
  { name: "Yuzu Green Tea Fizz", desc: "Sparkling green tea infused with bright, aromatic yuzu citrus. Zesty, refreshing, and perfectly effervescent.", price: 7.90, category: "Fruit Teas & Refreshers", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8849212a-595e-4cb9-a8b0-8c6994b76b47-retina-large.jpg" },

  // Kebab Wraps
  { name: "Kofta Wrap", desc: "Spiced, succulent Kofta patties, grilled, then wrapped in warm flatbread with fresh salad and creamy, zesty sauce.", price: 18.99, category: "Kebab Wraps", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e5755dff-d6a6-4027-a5b1-d1a0ff180c81-retina-large.jpg" },
  { name: "Falafel and Haloumi Wrap", desc: "Golden falafel and salty grilled halloumi, wrapped with fresh greens and creamy tahini sauce. Savory and satisfying.", price: 17.99, category: "Kebab Wraps", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/3109c44e-e710-443a-9dea-a5deeb65cc8e-retina-large.jpg" },
  { name: "Lamb Shish Wrap", desc: "Succulent cubes of marinated lamb, fire-grilled on a skewer, wrapped in warm pita with fresh salad and zesty sauce.", price: 19.99, category: "Kebab Wraps", imgUrl: null },
  { name: "Chicken Doner Wrap", desc: "Tender, marinated chicken, shaved from the spit, with fresh salad and zesty sauce.", price: 17.99, category: "Kebab Wraps", imgUrl: null },
  { name: "Chicken Shish Wrap", desc: "Tender, marinated chicken pieces, fire-grilled on a skewer, wrapped in warm flatbread with fresh salad and zesty sauce.", price: 18.99, category: "Kebab Wraps", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/ba043ee7-e9ac-4bcd-888c-0d917de7b1d7-retina-large.jpg" },

  // Snack Pack
  { name: "Snack Pack", desc: "A delightful assortment of snacks, perfect for sharing or enjoying on the go.", price: 23.99, category: "Snack Pack", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/2a6b6fa1-6093-41ab-8121-4526de5c4e0c-retina-large.jpg" },

  // Deals
  { name: "2 Momo Special Chicken", desc: "Two momo deal with a variety of styles and sauces — spicy, fried, steamed, and more.", price: 25.00, category: "Deals", imgUrl: null },
  { name: "3 Momo Special Chicken", desc: "Three-piece chicken momo deal with diverse styles like Chilli, Fried, Jhol, Sadheko, and Steam.", price: 35.00, category: "Deals", imgUrl: null },
  { name: "Momo Special Chicken", desc: "Momo special chicken options including spicy, fried, soupy, marinated, and steamed varieties.", price: 15.00, category: "Deals", imgUrl: null },

  // Ice Coffee
  { name: "Ice Chocolate", desc: "Rich, velvety chocolate blended with cold milk and ice. A decadent, cooling treat perfect for any time.", price: 6.00, category: "Ice Coffee", imgUrl: null },
  { name: "Ice Long Black", desc: "Bold, rich espresso shots poured over chilled water and ice for a crisp, refreshing coffee.", price: 6.00, category: "Ice Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7f6259d9-4cda-4ea4-ba95-c8f6db4cc844-retina-large.jpg" },
  { name: "Ice Latte", desc: "Smooth, chilled espresso mixed with milk, served over ice for a creamy, refreshing coffee treat.", price: 6.00, category: "Ice Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/76a7006d-1c68-4e3c-b723-2ffa1fcb3bc5-retina-large.jpg" },

  // Bubble Coffee
  { name: "Vietnamese Boba Coffee", desc: "Strong, sweet Vietnamese coffee combined with chewy boba pearls and a splash of milk. An authentic, fun treat.", price: 8.90, category: "Bubble Coffee", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/413c4607-b70b-41a0-84c1-b29c124c94c0-retina-large.jpg" },

  // Bubble Tea
  { name: "Bubble Tea", desc: "Sweet, creamy milk tea blended with ice and loaded with chewy, oversized tapioca pearls. A fun, customizable treat.", price: 7.90, category: "Bubble Tea", imgUrl: null },

  // Entrees
  { name: "Trio of Dip", desc: "A delightful platter of Hummus, Tzatziki, and Carrot Dip, served with warm, freshly baked pita bread for sharing.", price: 19.00, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/9e3398ed-6a4c-464e-b435-c294ffd6f4ef-retina-large.jpg" },
  { name: "Chicken Spring Roll", desc: "Tender shredded chicken and fresh vegetables, perfectly seasoned and wrapped in a crispy, golden shell. Served with sauce.", price: 6.99, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/f66db4b0-32f4-43c9-9d65-8f356fe122c3-retina-large.jpg" },
  { name: "Mediterranean Salad", desc: "Crisp greens, ripe tomatoes, cucumber, Kalamata olives, and feta cheese with a zesty lemon-herb dressing.", price: 7.99, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/42113724-1372-4c05-9f2b-26947544c0ec-retina-large.jpg" },
  { name: "Lamb Spring Roll", desc: "Tender, seasoned lamb and fresh vegetables wrapped in a crispy, golden pastry. Served with a savory dipping sauce.", price: 6.99, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/0aefa8c8-3b08-4ad7-a186-78f90bd94f3a-retina-large.jpg" },
  { name: "Carrot Dip", desc: "Sweet, roasted carrots blended with aromatic spices and a touch of lemon, perfect for dipping or spreading.", price: 9.00, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8d874247-3224-4590-bdd2-c3d5c17a47ec-retina-large.jpg" },
  { name: "Spinach and Fetta Spring Roll", desc: "Savory spinach and creamy feta cheese, encased in a crispy, golden spring roll wrapper. A delicious bite.", price: 5.99, category: "Entrees", imgUrl: null },
  { name: "Pita Bread", desc: "Warm, freshly baked flatbread, light and fluffy, perfect for dipping into hummus or scooping up salad.", price: 4.00, category: "Entrees", imgUrl: null },
  { name: "Samosa", desc: "Crispy, flaky pastry filled with spiced potatoes, peas, and herbs. A perfect, savory Indian appetizer.", price: 9.99, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/a160ff3f-406d-4ef3-805e-19cdf5ecfb28-retina-large.jpg" },
  { name: "Hummus with Pita Bread", desc: "Warm, fluffy pita bread paired with creamy, authentic hummus, drizzled with olive oil and a sprinkle of paprika.", price: 9.00, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/e46078d0-8033-4e00-b9dd-f47d22577c2d-retina-large.jpg" },
  { name: "Tzatziki with Pita Bread", desc: "Zesty Greek yogurt dip with cucumber, garlic, and fresh dill, served alongside warm, fluffy pita bread.", price: 9.00, category: "Entrees", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/ee9160ea-226d-47d0-a9da-5affd1afe3d0-retina-large.jpg" },

  // Beverages
  { name: "Fanta Orange Can", desc: "Zesty, bubbly, and brightly flavored. The classic Fanta Orange soda in a perfectly chilled, convenient can.", price: 3.50, category: "Beverages", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/386a42ff-0faf-4817-8bff-85a6920e313b-retina-large.jpg" },
  { name: "Lemonade Can", desc: "Zesty, sweet, and perfectly tart. The crisp, bubbly flavor of classic lemonade in a convenient chilled can.", price: 3.50, category: "Beverages", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/f4360c4d-91cb-464c-8e4e-d74bab423413-retina-large.jpg" },
  { name: "Sprite Can", desc: "Crisp, clear, lemon-lime flavor in a classic chilled can. A perfectly refreshing, bubbly thirst-quencher.", price: 3.50, category: "Beverages", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/f99ab28e-2444-4331-b7d1-a895283bdfef-retina-large.jpg" },
  { name: "Coca-Cola Zero Sugar Can", desc: "Crisp, refreshing Coca-Cola Zero Sugar in a convenient can. All the flavor, zero sugar.", price: 3.50, category: "Beverages", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/46d6f2a0-47a4-4043-a8ee-2d76db7cb97f-retina-large.jpg" },
  { name: "Coca-Cola Can", desc: "The classic, crisp taste of Coca-Cola in a convenient, perfectly chilled can. Highly refreshing.", price: 3.50, category: "Beverages", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/d9b22d29-d751-4e81-b844-5409dc79e629-retina-large.png" },

  // Special Momo
  { name: "Paneer Momo Platter", desc: "Soft, spiced paneer dumplings, steamed or fried, served with signature tangy dipping sauces.", price: 29.99, category: "Special Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/0d567aac-8fa0-4970-8569-5eda0ce2c857-retina-large.jpg" },
  { name: "Chicken Momo Platter", desc: "Delicious steamed chicken momos served with spicy dipping sauce, perfect for sharing or enjoying solo.", price: 27.99, category: "Special Momo", imgUrl: null },
  { name: "Buff Momo Platter", desc: "Savor our Buff Momo Platter, featuring tender dumplings filled with spiced buffalo meat and herbs.", price: 30.99, category: "Special Momo", imgUrl: null },
  { name: "Lhaphing", desc: "A chilled, savory mung bean noodle dish with chili oil, vinegar, and crunch. Fiery and refreshing.", price: 10.00, category: "Special Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/337fd097-87e8-4f9d-91a0-9dee391a997c-retina-large.jpg" },
  { name: "Chocolate Momo (2pcs)", desc: "Warm, delicate dumplings filled with rich, melting dark chocolate. A decadent, sweet twist on a savory classic.", price: 4.99, category: "Special Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/7a250d9c-d2a4-404a-9004-773d51d913af-retina-large.jpg" },

  // Momo
  { name: "Paneer Momo", desc: "Delicious steamed dumplings filled with spiced paneer, served with tangy dipping sauce for flavor.", price: 19.00, category: "Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/9c83e122-2b83-49d9-923d-21777d26a02c-retina-large.jpg" },
  { name: "Vegan Momo", desc: "Delicious steamed dumplings filled with seasoned vegetables, served with a tangy dipping sauce.", price: 17.00, category: "Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/6b9a45eb-3825-4ab2-bc10-56937cfd16be-retina-large.jpg" },
  { name: "Chicken Momo", desc: "Juicy ground chicken spiced with herbs, wrapped in delicate dough, and perfectly steamed. Served with sauce.", price: 18.00, category: "Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/75fc6cb9-8c8c-4143-978d-c859fe835b9d-retina-large.jpg" },
  { name: "Buff Momo", desc: "Savory buff momo dumplings, steamed to perfection and served with a spicy dipping sauce.", price: 20.00, category: "Momo", imgUrl: "https://img.cdn4dd.com/p/fit=cover,width=1200,height=1200,format=auto,quality=90/media/photosV2/8abfcb13-f120-4fad-b136-98216e58c803-retina-large.jpg" },
];

// Download image to buffer
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/jpeg' }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Upload to Manus S3 via built-in storage API
async function uploadToS3(buffer, contentType, filename) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: contentType });
  formData.append('file', blob, filename);
  
  const response = await fetch(`${S3_ENDPOINT}/storage/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${S3_KEY}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`S3 upload failed: ${response.status} ${text}`);
  }
  
  const data = await response.json();
  return data.url || data.data?.url;
}

async function main() {
  console.log('Connecting to database...');
  // TiDB requires SSL - parse the URL and pass ssl option separately
  const urlObj = new URL(DATABASE_URL);
  const conn = await createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 4000,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
  });
  
  // Check existing menu items to avoid duplicates
  const [existing] = await conn.execute('SELECT name FROM menuItems');
  const existingNames = new Set(existing.map(r => r.name.toLowerCase()));
  console.log(`Found ${existingNames.size} existing menu items`);
  
  let inserted = 0;
  let skipped = 0;
  
  for (const item of menuItems) {
    if (existingNames.has(item.name.toLowerCase())) {
      console.log(`  SKIP (exists): ${item.name}`);
      skipped++;
      continue;
    }
    
    // Use DoorDash CDN URL directly (publicly accessible)
    const imageUrl = item.imgUrl || null;
    
    // id is auto-increment int; price is stored in cents
    const priceInCents = Math.round(item.price * 100);
    await conn.execute(
      `INSERT INTO menuItems (name, description, price, category, imageUrl, isAvailable) 
       VALUES (?, ?, ?, ?, ?, 1)`,
      [item.name, item.desc, priceInCents, item.category, imageUrl]
    );
    console.log(`  INSERTED: ${item.name} (${item.category}) - A$${item.price}`);
    inserted++;
  }
  
  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
  await conn.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
