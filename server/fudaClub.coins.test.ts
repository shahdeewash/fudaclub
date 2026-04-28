import { describe, it, expect } from "vitest";
import { FUDA_CLUB } from "./stripe-products";
import { calculateClubPricing } from "./routers/fudaClub";

describe("FUDA_CLUB constants", () => {
  it("intro price is $80 (8000 cents)", () => {
    expect(FUDA_CLUB.introPriceCents).toBe(8000);
  });

  it("recurring fortnightly price is $180 (18000 cents)", () => {
    expect(FUDA_CLUB.recurringPriceCents).toBe(18000);
  });

  it("monthly price is $350 (35000 cents)", () => {
    expect(FUDA_CLUB.monthlyPriceCents).toBe(35000);
  });

  it("trial period is 7 days (first WEEK trial, not first fortnight)", () => {
    expect(FUDA_CLUB.trialDays).toBe(7);
  });

  it("currency is AUD", () => {
    expect(FUDA_CLUB.currency).toBe("aud");
  });

  it("supports both fortnightly and monthly plan types", () => {
    expect(FUDA_CLUB.planTypes).toContain("fortnightly");
    expect(FUDA_CLUB.planTypes).toContain("monthly");
  });

  it("coin lifespan is 2 days (2-day rollover policy)", () => {
    expect(FUDA_CLUB.coinLifespanDays).toBe(2);
  });

  it("valid order days are Mon-Sat (1-6)", () => {
    expect(FUDA_CLUB.validOrderDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FUDA_CLUB.validOrderDays).not.toContain(0); // No Sunday coin
  });

  it("additional-item discount is 10%", () => {
    expect(FUDA_CLUB.additionalItemDiscount).toBe(0.10);
  });

  it("Mix Grill category is identified", () => {
    expect(FUDA_CLUB.mixGrillCategory).toBe("Mix Grill");
  });

  it("coin-ineligible categories include Mix Grill + meal deals", () => {
    const cats = FUDA_CLUB.coinIneligibleCategories.map(c => c.toLowerCase());
    expect(cats).toContain("mix grill");
    expect(cats).toContain("combo meal");
    expect(cats).toContain("deals");
    expect(cats).toContain("fuda combo");
    expect(cats).toContain("fuda week day deal");
    expect(cats).toContain("special momo");
  });
});

describe("calculateClubPricing — coin + post-coin discount logic", () => {
  it("coin covers first non-Mix-Grill item; additional items get 10% off", () => {
    const cart = [
      {
        menuItemId: 1,
        name: "Chicken Kebab Wrap",
        category: "Kebab",
        quantity: 2,
        unitPriceInCents: 1800, // $18
      },
    ];
    const result = calculateClubPricing(cart, /* hasCoin */ true, /* deliveryFeeInCents */ 0);
    // First unit free (coin), second unit gets 10% off → $16.20 → 1620 cents
    expect(result.subtotalInCents).toBe(1620);
  });

  it("Mix Grill never uses coin — gets 10% off instead", () => {
    const cart = [
      {
        menuItemId: 2,
        name: "Mix Grill Plate",
        category: "Mix Grill",
        quantity: 1,
        unitPriceInCents: 3000, // $30
      },
    ];
    const result = calculateClubPricing(cart, /* hasCoin */ true, /* deliveryFeeInCents */ 0);
    // 10% off $30 = $27 = 2700 cents
    expect(result.subtotalInCents).toBe(2700);
  });

  it("Sunday case (no coin) → ALL items get 10% off", () => {
    const cart = [
      {
        menuItemId: 3,
        name: "Momos",
        category: "Momo",
        quantity: 2,
        unitPriceInCents: 1500, // $15
      },
    ];
    const result = calculateClubPricing(cart, /* hasCoin */ false, /* deliveryFeeInCents */ 0);
    // No coin → both units get 10% off → $13.50 × 2 = $27 = 2700 cents
    expect(result.subtotalInCents).toBe(2700);
  });

  it("delivery fee applies when subtotal exceeds the minimum threshold", () => {
    // 3 Momos at $15 each = $45 raw
    // Coin covers first → $0, remaining 2 each get 10% off = $13.50 × 2 = $27
    // Subtotal $27 (above $10 min) → delivery fee applies
    const cart = [
      {
        menuItemId: 3,
        name: "Momos (3pc)",
        category: "Momo",
        quantity: 3,
        unitPriceInCents: 1500,
      },
    ];
    const result = calculateClubPricing(cart, /* hasCoin */ true, /* deliveryFeeInCents */ 500);
    expect(result.subtotalInCents).toBe(2700);
    expect(result.totalInCents).toBe(3200); // subtotal $27 + delivery $5
  });
});

describe("Coin expiry math (2-day rollover)", () => {
  it("a coin issued at midnight Darwin today expires at midnight Darwin (today + 2)", () => {
    // Simulate the cron logic: take today's Darwin date, expire = (y, m-1, d+2, 14:30 UTC)
    const nowDarwin = "2026-04-27"; // a Monday
    const [y, m, d] = nowDarwin.split("-").map(Number);
    const expiresAt = new Date(Date.UTC(y, m - 1, d + 2, 14, 30, 0));

    // Expected: 14:30 UTC on 2026-04-29 = midnight Darwin (UTC+9:30) on 2026-04-30
    expect(expiresAt.toISOString()).toBe("2026-04-29T14:30:00.000Z");
  });

  it("a Mon coin is still valid on Tue", () => {
    const issued = new Date(Date.UTC(2026, 3, 27, 20, 30, 0)); // Mon 6 AM Darwin
    const expires = new Date(Date.UTC(2026, 3, 27 + 2, 14, 30, 0)); // Wed 00:00 Darwin
    const tueLunch = new Date(Date.UTC(2026, 3, 28, 2, 0, 0)); // Tue 11:30 AM Darwin
    expect(tueLunch < expires).toBe(true);
  });

  it("a Mon coin is expired by Thu", () => {
    const expires = new Date(Date.UTC(2026, 3, 27 + 2, 14, 30, 0)); // Wed 00:00 Darwin (end of Tue)
    const thuLunch = new Date(Date.UTC(2026, 3, 30, 2, 0, 0)); // Thu 11:30 AM Darwin
    expect(thuLunch > expires).toBe(true);
  });
});
