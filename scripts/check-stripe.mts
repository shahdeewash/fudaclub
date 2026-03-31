import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const key = process.env.STRIPE_SECRET_KEY || "";
console.log("Key present:", !!key);
console.log("Mode:", key.startsWith("sk_test") ? "TEST" : key.startsWith("sk_live") ? "LIVE" : "UNKNOWN/MISSING");
console.log("Key prefix:", key.substring(0, 12) + "...");

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
console.log("Webhook secret present:", !!webhookSecret);
console.log("Webhook secret prefix:", webhookSecret.substring(0, 10) + "...");

const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
console.log("Publishable key present:", !!publishableKey);
console.log("Publishable key prefix:", publishableKey.substring(0, 12) + "...");

if (!key) {
  console.error("❌ No Stripe secret key found");
  process.exit(1);
}

const stripe = new Stripe(key);

try {
  const products = await stripe.products.list({ limit: 5 });
  console.log("\n✅ Stripe API connection: OK");
  console.log("Products in Stripe:", products.data.length);
  products.data.forEach(p => console.log(" -", p.name, "(active:", p.active, ")"));

  const prices = await stripe.prices.list({ limit: 5, active: true });
  console.log("\nActive prices:", prices.data.length);
  prices.data.forEach(p => console.log(" -", p.id, p.currency.toUpperCase(), (p.unit_amount || 0) / 100, p.recurring ? `every ${p.recurring.interval_count} ${p.recurring.interval}` : "one-time"));
} catch (e: any) {
  console.error("❌ Stripe API error:", e.message);
}
