/**
 * FÜDA Club Stripe Product Definitions
 *
 * Three plans:
 *  - 7-Day Trial:
 *      First payment: $80 AUD, billed at signup
 *      Then auto-rolls into the standard $180/fortnight ongoing
 *      Implemented as: $180/fortnight recurring + $100-off-first-invoice coupon
 *      → User sees $80 charge on day 1, $180 every 14 days starting day 15.
 *  - Fortnightly:
 *      $180 AUD every 2 weeks, billed from day 1, no trial, no intro discount
 *  - Monthly:
 *      $350 AUD every month, billed from day 1, no trial, no intro discount
 *
 * Why coupon (not subscription_schedule with phases):
 *  - Vastly simpler — single Stripe checkout session, no separate webhook flow
 *  - Predictable billing in Stripe dashboard
 *  - Members can switch plans cleanly via the customer portal later
 *
 * Price IDs are created inline (price_data) per checkout session; no manual
 * Stripe dashboard setup is required for go-live. The intro coupon is created
 * once on first use and re-used by id thereafter (cached in process memory).
 */

export const FUDA_CLUB = {
  /** Display name shown on Stripe checkout and receipts */
  productName: "The FÜDA Club",

  /** Introductory first-FORTNIGHT price in cents (AUD) — trial plan only */
  introPriceCents: 8000, // $80.00

  /** Ongoing fortnightly recurring price in cents (AUD) — trial + fortnightly plans */
  recurringPriceCents: 18000, // $180.00

  /** Monthly recurring price in cents (AUD) — monthly plan */
  monthlyPriceCents: 35000, // $350.00

  /**
   * Discount applied to the FIRST invoice of the trial plan, in cents.
   * recurringPriceCents - trialDiscountCents = introPriceCents
   *           18000     -        10000        =      8000
   */
  trialDiscountCents: 10000, // $100.00

  /** Billing interval (trial + fortnightly plans) */
  interval: "week" as const,
  intervalCount: 2, // every 2 weeks = fortnightly

  /** Currency */
  currency: "aud",

  /** Trial days — kept for legacy-compat; not used by the new coupon-based flow */
  trialDays: 7,

  /** Plan types supported (now includes "trial" as a distinct tile) */
  planTypes: ["trial", "fortnightly", "monthly"] as const,

  /** Discount on every order for active Club members (as decimal) */
  memberDiscount: 0.10, // 10%

  /** Legacy alias — same value as memberDiscount; kept so old imports don't break */
  additionalItemDiscount: 0.10, // 10%

  /** Mix Grill category name — coin cannot be applied, 10% off instead */
  mixGrillCategory: "Mix Grill",

  /**
   * Categories where the FÜDA Coin can NOT be applied (10% off only).
   * These are pre-discounted bundles + special items where stacking a free-meal
   * coin on top would erode margin too much. Per-item override available via
   * the menuItems.coinEligible flag (admin dashboard). Match is case-insensitive
   * and lower-cased; entries here are the source-of-truth display names.
   */
  coinIneligibleCategories: [
    "Mix Grill",
    "Combo Meal",
    "Deals",
    "Fuda Combo",
    "Fuda Week Day Deal",
    "Special Momo",
  ] as const,

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
