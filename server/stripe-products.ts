/**
 * FÜDA Club Stripe Product Definitions
 *
 * Billing model:
 *  - First payment: $80 AUD (introductory fortnight)
 *  - Ongoing: $180 AUD every 2 weeks (fortnightly)
 *
 * Implementation strategy:
 *  - One Stripe subscription with a 14-day trial at $0 is NOT used here.
 *  - Instead we use a coupon for the first period: create a subscription
 *    with a $100 discount coupon (making first $180 → $80) that applies
 *    once, then auto-expires.
 *  - Alternatively, use a Stripe Price with a trial_period_days=0 and
 *    a one-time setup fee via add_invoice_items.
 *
 * Simplest approach used here:
 *  1. Create checkout session with line_items: [$80 one-time setup fee]
 *     + subscription line_items: [$180 fortnightly recurring]
 *     with subscription_data.trial_period_days = 14 so the recurring
 *     charge starts 14 days after the $80 setup fee.
 *
 * Price IDs are created programmatically on first use and cached in env.
 */

export const FUDA_CLUB = {
  /** Display name shown on Stripe checkout and receipts */
  productName: "The FÜDA Club",

  /** Introductory first-fortnight price in cents (AUD) */
  introPriceCents: 8000, // $80.00

  /** Ongoing fortnightly recurring price in cents (AUD) */
  recurringPriceCents: 18000, // $180.00

  /** Billing interval */
  interval: "week" as const,
  intervalCount: 2, // every 2 weeks = fortnightly

  /** Currency */
  currency: "aud",

  /** Trial days — the recurring subscription starts 14 days after signup */
  trialDays: 14,

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

  /** Max freeze duration in days */
  maxFreezeDays: 14,
} as const;
