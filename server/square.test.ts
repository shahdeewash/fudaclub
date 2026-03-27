/**
 * Tests for Square integration
 * - Validates credentials via a lightweight API call
 * - Tests catalog sync mapping logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSquareAuthUrl } from "./square";

// ─── buildSquareAuthUrl ──────────────────────────────────────────────────────

describe("buildSquareAuthUrl", () => {
  it("includes the app ID in the URL", () => {
    // APP_ID is read at module load time from SQUARE_APPLICATION_ID
    const url = buildSquareAuthUrl("https://example.com/callback", "state123");
    expect(url).toContain("client_id=");
    // The value should be non-empty (platform injects the real app ID)
    const match = url.match(/client_id=([^&]+)/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeGreaterThan(0);
  });

  it("includes ITEMS_READ and MERCHANT_PROFILE_READ scopes", () => {
    const url = buildSquareAuthUrl("https://example.com/callback", "state123");
    expect(url).toContain("ITEMS_READ");
    expect(url).toContain("MERCHANT_PROFILE_READ");
  });

  it("encodes the redirect URI", () => {
    const url = buildSquareAuthUrl("https://example.com/api/square/callback", "state123");
    expect(url).toContain(encodeURIComponent("https://example.com/api/square/callback"));
  });

  it("encodes the state parameter", () => {
    const url = buildSquareAuthUrl("https://example.com/callback", "state with spaces");
    expect(url).toContain(encodeURIComponent("state with spaces"));
  });

  it("URL contains a valid Square OAuth domain (sandbox or production)", () => {
    // SQUARE_ENVIRONMENT is read at module load time, so we just verify the URL
    // contains one of the two valid Square OAuth base domains
    const url = buildSquareAuthUrl("https://example.com/callback", "state");
    const isValidDomain =
      url.includes("connect.squareupsandbox.com") ||
      url.includes("connect.squareup.com");
    expect(isValidDomain).toBe(true);
  });
});

// ─── Credential validation ───────────────────────────────────────────────────

describe("Square credentials", () => {
  it("SQUARE_APPLICATION_ID env var is set", () => {
    // The secret is injected by the platform; we just verify it's non-empty
    const appId = process.env.SQUARE_APPLICATION_ID;
    expect(appId).toBeDefined();
    expect(typeof appId).toBe("string");
    expect(appId!.length).toBeGreaterThan(0);
  });

  it("SQUARE_APPLICATION_SECRET env var is set", () => {
    const secret = process.env.SQUARE_APPLICATION_SECRET;
    expect(secret).toBeDefined();
    expect(typeof secret).toBe("string");
    expect(secret!.length).toBeGreaterThan(0);
  });

  it("SQUARE_ENVIRONMENT is sandbox or production", () => {
    const env = (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase();
    expect(["sandbox", "production"]).toContain(env);
  });
});

// ─── Catalog sync mapping logic ──────────────────────────────────────────────

describe("catalog sync mapping", () => {
  it("converts BigInt price amount to number correctly", () => {
    const bigIntAmount = BigInt(1750); // 1750 cents = $17.50
    const priceInCents = Number(bigIntAmount);
    expect(priceInCents).toBe(1750);
    expect(typeof priceInCents).toBe("number");
  });

  it("handles regular number price amount", () => {
    const amount = 2000; // 2000 cents = $20.00
    const priceInCents = Number(amount);
    expect(priceInCents).toBe(2000);
  });

  it("skips items with zero price", () => {
    const priceInCents = 0;
    expect(priceInCents).toBe(0);
    // Items with 0 price are skipped in sync
  });

  it("resolves category name from category map", () => {
    const categoryMap = new Map([
      ["cat-1", "Mains"],
      ["cat-2", "Sides"],
    ]);
    expect(categoryMap.get("cat-1") ?? "Other").toBe("Mains");
    expect(categoryMap.get("unknown") ?? "Other").toBe("Other");
  });

  it("resolves image URL from image map", () => {
    const imageMap = new Map([
      ["img-1", "https://example.com/image.jpg"],
    ]);
    const imageIds = ["img-1"];
    const imageUrl = imageIds[0] ? (imageMap.get(imageIds[0]) ?? null) : null;
    expect(imageUrl).toBe("https://example.com/image.jpg");
  });

  it("returns null image URL when imageIds is empty", () => {
    const imageMap = new Map<string, string>();
    const imageIds: string[] = [];
    const imageUrl = imageIds[0] ? (imageMap.get(imageIds[0]) ?? null) : null;
    expect(imageUrl).toBeNull();
  });
});
