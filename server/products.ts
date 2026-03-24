/**
 * Stripe product and price definitions for FÜDA Corporate Lunch Deal.
 * All amounts are in AUD cents.
 */

export const SUBSCRIPTION_PLAN = {
  name: "FÜDA Corporate Lunch Deal",
  description: "Daily free meal credit + team delivery benefits. Billed fortnightly.",
  /** $25.00 AUD per fortnight */
  amount: 2500,
  currency: "aud",
  /**
   * Stripe does not have a built-in "fortnight" interval.
   * We use interval: "week" with interval_count: 2 (every 2 weeks).
   */
  interval: "week" as const,
  interval_count: 2,
} as const;

/**
 * Lazily creates (or retrieves) the Stripe product and price for the subscription plan.
 * Caches the price ID in memory so we only call the Stripe API once per server boot.
 */
let cachedPriceId: string | null = null;

export async function getOrCreateSubscriptionPriceId(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

  // Search for existing product by name
  const products = await stripe.products.search({ query: `name:"${SUBSCRIPTION_PLAN.name}"` });
  let product = products.data[0];

  if (!product) {
    product = await stripe.products.create({
      name: SUBSCRIPTION_PLAN.name,
      description: SUBSCRIPTION_PLAN.description,
    });
  }

  // Search for existing active recurring price on this product
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: "recurring",
  });

  const existingPrice = prices.data.find(
    (p) =>
      p.unit_amount === SUBSCRIPTION_PLAN.amount &&
      p.currency === SUBSCRIPTION_PLAN.currency &&
      p.recurring?.interval === SUBSCRIPTION_PLAN.interval &&
      p.recurring?.interval_count === SUBSCRIPTION_PLAN.interval_count
  );

  if (existingPrice) {
    cachedPriceId = existingPrice.id;
    return cachedPriceId;
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: SUBSCRIPTION_PLAN.amount,
    currency: SUBSCRIPTION_PLAN.currency,
    recurring: {
      interval: SUBSCRIPTION_PLAN.interval,
      interval_count: SUBSCRIPTION_PLAN.interval_count,
    },
  });

  cachedPriceId = price.id;
  return cachedPriceId;
}
