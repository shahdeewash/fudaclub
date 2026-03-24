/**
 * Stripe product and price definitions for FÜDA Corporate Lunch Deal.
 * All amounts are in AUD cents.
 */

export type PlanType = "fortnightly" | "monthly";

export const SUBSCRIPTION_PLANS: Record<PlanType, {
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: "week" | "month";
  interval_count: number;
  label: string;
  billingLabel: string;
  features: string[];
}> = {
  fortnightly: {
    name: "FÜDA Corporate Lunch Deal – Fortnightly",
    description: "Daily free meal credit + team delivery benefits. Billed every 2 weeks.",
    /** $270.00 AUD per fortnight */
    amount: 27000,
    currency: "aud",
    interval: "week",
    interval_count: 2,
    label: "Fortnightly",
    billingLabel: "Billed every 2 weeks",
    features: [
      "Daily free meal credit (up to $18 value)",
      "Free delivery when 5+ colleagues order",
      "Access to Today's Special",
      "Priority pickup lane",
    ],
  },
  monthly: {
    name: "FÜDA Corporate Lunch Deal – Monthly",
    description: "Daily free meal credit + team delivery benefits. Billed monthly.",
    /** $500.00 AUD per month */
    amount: 50000,
    currency: "aud",
    interval: "month",
    interval_count: 1,
    label: "Monthly",
    billingLabel: "Billed monthly",
    features: [
      "Daily free meal credit (up to $18 value)",
      "Free delivery when 5+ colleagues order",
      "Access to Today's Special",
      "Priority pickup lane",
      "Save ~$40 vs fortnightly billing",
    ],
  },
};

/**
 * Cache price IDs per plan type so we only call the Stripe API once per server boot.
 */
const cachedPriceIds: Partial<Record<PlanType, string>> = {};

export async function getOrCreatePriceId(planType: PlanType): Promise<string> {
  if (cachedPriceIds[planType]) return cachedPriceIds[planType]!;

  const plan = SUBSCRIPTION_PLANS[planType];
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

  // Search for existing product by name
  const products = await stripe.products.search({ query: `name:"${plan.name}"` });
  let product = products.data[0];

  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
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
      p.unit_amount === plan.amount &&
      p.currency === plan.currency &&
      p.recurring?.interval === plan.interval &&
      p.recurring?.interval_count === plan.interval_count
  );

  if (existingPrice) {
    cachedPriceIds[planType] = existingPrice.id;
    return existingPrice.id;
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.amount,
    currency: plan.currency,
    recurring: {
      interval: plan.interval,
      interval_count: plan.interval_count,
    },
  });

  cachedPriceIds[planType] = price.id;
  return price.id;
}

/**
 * Legacy helper kept for backward compatibility.
 * @deprecated Use getOrCreatePriceId("fortnightly") instead.
 */
export async function getOrCreateSubscriptionPriceId(): Promise<string> {
  return getOrCreatePriceId("fortnightly");
}
