import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { SUBSCRIPTION_PLANS } from "./products";

describe("Subscription Plans", () => {
  it("fortnightly plan has correct amount and interval", () => {
    const plan = SUBSCRIPTION_PLANS.fortnightly;
    expect(plan.amount).toBe(27000); // $270.00 AUD in cents
    expect(plan.currency).toBe("aud");
    expect(plan.interval).toBe("week");
    expect(plan.interval_count).toBe(2);
  });

  it("monthly plan has correct amount and interval", () => {
    const plan = SUBSCRIPTION_PLANS.monthly;
    expect(plan.amount).toBe(50000); // $500.00 AUD in cents
    expect(plan.currency).toBe("aud");
    expect(plan.interval).toBe("month");
    expect(plan.interval_count).toBe(1);
  });

  it("monthly plan is cheaper per day than fortnightly", () => {
    const fortnightlyPerDay = SUBSCRIPTION_PLANS.fortnightly.amount / 14;
    const monthlyPerDay = SUBSCRIPTION_PLANS.monthly.amount / 30;
    expect(monthlyPerDay).toBeLessThan(fortnightlyPerDay);
  });
});

describe("getSubscriptionsExpiringWithin", () => {
  let testUserId: number;
  let testCompanyId: number;

  beforeAll(async () => {
    // Create a test company
    const companies = await db.getAllCompanies();
    let company = companies.find((c) => c.domain === "expiry-test.com");
    if (!company) {
      company = await db.createCompany({ name: "Expiry Test Co", domain: "expiry-test.com" });
    }
    testCompanyId = company.id;

    // Create a test user
    await db.upsertUser({
      openId: "expiry-test-user-001",
      name: "Expiry Test User",
      email: "expiry@expiry-test.com",
      loginMethod: "test",
      companyId: testCompanyId,
    });
    const user = await db.getUserByOpenId("expiry-test-user-001");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("finds subscriptions expiring within 3 days", async () => {
    const now = new Date();
    const expiresIn2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const startDate = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);

    // Create a subscription expiring in 2 days
    await db.createSubscription({
      userId: testUserId,
      stripeSubscriptionId: `sub_expiry_test_${Date.now()}`,
      stripeCustomerId: `cus_expiry_test_${Date.now()}`,
      status: "active",
      planAmount: 27000,
      planType: "fortnightly",
      currentPeriodStart: startDate,
      currentPeriodEnd: expiresIn2Days,
      cancelAtPeriodEnd: false,
    });

    const expiring = await db.getSubscriptionsExpiringWithin(3);
    const found = expiring.find((s) => s.userId === testUserId);
    expect(found).toBeDefined();
    expect(found?.planType).toBe("fortnightly");
  });

  it("does not return subscriptions expiring in more than 3 days", async () => {
    const now = new Date();
    const expiresIn10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const startDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    // Create a second user for this test (use unique openId to avoid stale data)
    await db.upsertUser({
      openId: `expiry-test-user-far-${Date.now()}`,
      name: "Expiry Test User Far",
      email: `expiry-far-${Date.now()}@expiry-test.com`,
      loginMethod: "test",
      companyId: testCompanyId,
    });
    // Get the user we just created by the unique email
    const allUsers = await db.getAllUsers?.() ?? [];
    // Use a unique stripeSubscriptionId so we can identify this specific subscription
    const uniqueSubId = `sub_expiry_far_${Date.now()}`;

    // Create a fresh user with a unique openId
    const uniqueOpenId = `expiry-test-user-far-${Date.now()}`;
    await db.upsertUser({
      openId: uniqueOpenId,
      name: "Expiry Test User Far",
      email: `expiry-far-${Date.now()}@expiry-test.com`,
      loginMethod: "test",
      companyId: testCompanyId,
    });
    const user2 = await db.getUserByOpenId(uniqueOpenId);
    if (!user2) throw new Error("Failed to create test user far");

    await db.createSubscription({
      userId: user2.id,
      stripeSubscriptionId: uniqueSubId,
      stripeCustomerId: `cus_expiry_far_${Date.now()}`,
      status: "active",
      planAmount: 50000,
      planType: "monthly",
      currentPeriodStart: startDate,
      currentPeriodEnd: expiresIn10Days,
      cancelAtPeriodEnd: false,
    });

    const expiring = await db.getSubscriptionsExpiringWithin(3);
    // Check by unique subscription ID, not userId (avoids stale data from previous runs)
    const found = expiring.find((s) => s.stripeSubscriptionId === uniqueSubId);
    expect(found).toBeUndefined();
  });
});
