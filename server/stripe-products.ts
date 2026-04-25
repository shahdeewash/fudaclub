/**
 * FÜDA Club Stripe Product Definitions
 *
 * Billing model:
 *  - Fortnightly plan:
 *      First payment: $80 AUD (introductory WEEK)
 *      Ongoing: $180 AUD every 2 weeks (fortnightly)
 *  - Monthly plan:
 *      $350 AUD every month (no intro discount)
 *
 * Implementation strategy:
 *  - Fortnightly: Stripe checkout session with the $180/fortnight recurring price,
 *    using subscription_data.trial_period_days = 7 so the first recurring charge
 *    happens 7 days after signup. The $80 intro is added as a one-time line item
 *    or invoice item handled at checkout.
 *  - Monthly: straight monthly recurring at $350. No trial, no intro discount.
 *
 * Price IDs are created programmatically on first use and cached in env.
 */

export const FUDA_CLUB = {
  /** Display name shown on Stripe checkout and receipts */
  productName: "The FÜDA Club",

  /** Introductory first-WEEK price in cents (AUD) — fortnightly plan only */
  introPriceCents: 8000, // $80.00

  /** Ongoing fortnightly recurring price in cents (AUD) */
  recurringPriceCents: 18000, // $180.00

  /** Monthly recurring price in cents (AUD) — alternative to fortnightly */
  monthlyPriceCents: 35000, // $350.00

  /** Billing interval (fortnightly plan) */
  interval: "week" as const,
  intervalCount: 2, // every 2 weeks = fortnightly

  /** Currency */
  currency: "aud",

  /** Trial days for the FORTNIGHTLY plan — recurring $180 starts 7 days after signup */
  trialDays: 7,

  /** Plan types supported */
  planTypes: ["fortnightly", "monthly"] as const,

  /** Discount on additional items for active Club members (as decimal) */
  additionalItemDiscount: 0.10, // 10%

  /** Mix Grill category name — coin cannot be applied, 10% off instead */
  mixGrillCategory: "Mix Grill",

  /** Minimum order subtotal in cents to qualify for free delivery */
  minDeliverySubtotalCents: 1000, // $10.00

  /** Delivery cutoff time in Darwin (HH:MM 24h) */
  deliveryCutoffTime: "10:30",

  /** Delivery run time in Darwin (HH:MM 24h) */
  deliveryRunTime: "12:30",

  /** Valid order days (0=Sun, 1=Mon, ..., 6=Sat) */
  validOrderDays: [1, 2, 3, 4, 5, 6], // Mon–Sat

  /** Coin issuance time in Darwin (HH:MM 24h) */
  coinIssuanceTime: "06:00",

  /** Coin lifespan in days (2-day rollover policy) */
  coinLifespanDays: 2,

  /** Max freeze duration in days */
  maxFreezeDays: 14,
} as const;

export type FudaClubPlanType = (typeof FUDA_CLUB.planTypes)[number];
