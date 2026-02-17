import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(user?: Partial<AuthenticatedUser>): TrpcContext {
  const defaultUser: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "john@apple.com",
    name: "John Doe",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...user,
  };

  return {
    user: defaultUser,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Company Detection", () => {
  it("should detect company from email domain", async () => {
    const ctx = createAuthContext({ email: "john@apple.com" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.company.detectFromEmail({ email: "john@apple.com" });

    expect(result.company.name).toBe("Apple");
    expect(result.company.domain).toBe("apple.com");
  });

  it("should handle generic email domains", async () => {
    const ctx = createAuthContext({ email: "user@gmail.com" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.company.detectFromEmail({ email: "user@gmail.com" });

    expect(result.company.name).toBe("Gmail");
    expect(result.company.domain).toBe("gmail.com");
  });

  it("should return colleague count for existing company", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First user creates company
    const result1 = await caller.company.detectFromEmail({ email: "user1@testcompany.com" });
    
    // Create subscription for first user
    await caller.subscription.create({ companyId: result1.company.id });

    // Second user checks same company
    const ctx2 = createAuthContext({ id: 2, email: "user2@testcompany.com" });
    const caller2 = appRouter.createCaller(ctx2);
    const result2 = await caller2.company.detectFromEmail({ email: "user2@testcompany.com" });

    expect(result2.colleagueCount).toBeGreaterThan(0);
  });
});

describe("Subscription Management", () => {
  it("should create subscription for new user", async () => {
    const ctx = createAuthContext({ email: "newuser@company.com" });
    const caller = appRouter.createCaller(ctx);

    // Detect company first
    const companyResult = await caller.company.detectFromEmail({ email: "newuser@company.com" });

    // Create subscription
    const subscription = await caller.subscription.create({
      companyId: companyResult.company.id,
    });

    expect(subscription.status).toBe("active");
    expect(subscription.price).toBe(2500); // $25.00
  });

  it("should retrieve user's subscription", async () => {
    const ctx = createAuthContext({ email: "subscriber@company.com" });
    const caller = appRouter.createCaller(ctx);

    // Create subscription
    const companyResult = await caller.company.detectFromEmail({ email: "subscriber@company.com" });
    await caller.subscription.create({ companyId: companyResult.company.id });

    // Retrieve subscription
    const subscription = await caller.subscription.getMine();

    expect(subscription).toBeDefined();
    expect(subscription?.status).toBe("active");
  });

  it("should return null for user without subscription", async () => {
    const ctx = createAuthContext({ id: 999, email: "nosubscription@company.com" });
    const caller = appRouter.createCaller(ctx);

    const subscription = await caller.subscription.getMine();

    expect(subscription).toBeNull();
  });
});
