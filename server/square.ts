/**
 * Square integration helpers
 * - OAuth token exchange
 * - Catalog sync (ITEM + ITEM_VARIATION + CATEGORY)
 *
 * Uses Square Node.js SDK v44 (SquareClient / SquareEnvironment)
 * - catalog.list() returns Promise<Page<CatalogObject>> — iterate with for-await
 * - merchants.get({ merchantId }) takes an object, not a string
 */

import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "./db";
import { squareConnections, menuItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Environment ────────────────────────────────────────────────────────────

const APP_ID = process.env.SQUARE_APPLICATION_ID ?? "";
const APP_SECRET = process.env.SQUARE_APPLICATION_SECRET ?? "";
const SQ_ENV =
  (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

// Base URL for OAuth endpoints
const OAUTH_BASE =
  SQ_ENV === SquareEnvironment.Production
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

// ─── OAuth helpers ───────────────────────────────────────────────────────────

/** Build the Square OAuth authorization URL */
export function buildSquareAuthUrl(redirectUri: string, state: string): string {
  const scopes = ["ITEMS_READ", "MERCHANT_PROFILE_READ"].join("+");
  return (
    `${OAUTH_BASE}/oauth2/authorize` +
    `?client_id=${APP_ID}` +
    `&scope=${scopes}` +
    `&session=false` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`
  );
}

/** Exchange authorization code for access + refresh tokens */
export async function exchangeSquareCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  merchantId: string;
  expiresAt: Date | null;
}> {
  const res = await fetch(`${OAUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": "2024-01-18",
    },
    body: JSON.stringify({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Square token exchange failed: ${err}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    merchant_id: string;
    expires_at?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    merchantId: data.merchant_id,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
}

/** Fetch merchant business name for a given access token */
export async function fetchMerchantName(accessToken: string): Promise<string> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });
  // SDK v44: merchants.get({ merchantId }) — pass object, not plain string
  const response = await client.merchants.get({ merchantId: "me" });
  const merchant = response.merchant;
  return merchant?.businessName ?? merchant?.id ?? "Unknown";
}

/** Fetch first location ID for a given access token */
export async function fetchFirstLocationId(accessToken: string): Promise<string | null> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });
  const response = await client.locations.list();
  return response.locations?.[0]?.id ?? null;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function saveSquareConnection(
  userId: number,
  data: {
    accessToken: string;
    refreshToken: string | null;
    merchantId: string;
    merchantName: string;
    locationId: string | null;
    expiresAt: Date | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Upsert: delete existing then insert fresh
  await db.delete(squareConnections).where(eq(squareConnections.userId, userId));
  await db.insert(squareConnections).values({
    userId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? undefined,
    merchantId: data.merchantId,
    merchantName: data.merchantName,
    locationId: data.locationId ?? undefined,
    expiresAt: data.expiresAt ?? undefined,
  });
}

export async function getSquareConnection(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(squareConnections)
    .where(eq(squareConnections.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSquareConnection(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(squareConnections).where(eq(squareConnections.userId, userId));
}

// ─── Catalog sync ────────────────────────────────────────────────────────────

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  categories: string[];
}

/**
 * Pull ITEM + ITEM_VARIATION + CATEGORY from Square Catalog API and upsert
 * into the FÜDA menuItems table.
 *
 * SDK v44: catalog.list() returns Promise<Page<CatalogObject>>.
 * Page implements AsyncIterable<CatalogObject>, so we use for-await to
 * transparently handle pagination.
 */
export async function syncSquareCatalog(accessToken: string): Promise<SyncResult> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });

  // 1. Fetch all catalog objects via async iteration (auto-paginates)
  const allObjects: Record<string, unknown>[] = [];

  const page = await client.catalog.list({
    types: "ITEM,ITEM_VARIATION,CATEGORY,IMAGE",
  });

  for await (const obj of page) {
    allObjects.push(obj as unknown as Record<string, unknown>);
  }

  // 2. Build lookup maps
  const categoryMap = new Map<string, string>(); // id → name
  const imageMap = new Map<string, string>(); // id → url

  for (const obj of allObjects) {
    if (obj.type === "CATEGORY" && obj.id) {
      const catData = obj.categoryData as { name?: string } | undefined;
      categoryMap.set(obj.id as string, catData?.name ?? "Other");
    }
    if (obj.type === "IMAGE" && obj.id) {
      const imgData = obj.imageData as { url?: string } | undefined;
      if (imgData?.url) imageMap.set(obj.id as string, imgData.url);
    }
  }

  // 3. Process ITEM objects
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const seenCategories = new Set<string>();

  for (const obj of allObjects) {
    if (obj.type !== "ITEM") continue;

    const itemData = obj.itemData as {
      name?: string;
      description?: string;
      categoryId?: string;
      imageIds?: string[];
      variations?: Array<{
        id: string;
        itemVariationData?: {
          name?: string;
          priceMoney?: { amount?: bigint | number; currency?: string };
        };
      }>;
    } | undefined;

    if (!itemData?.name) { skipped++; continue; }

    // Use first variation's price
    const firstVariation = itemData.variations?.[0];
    const priceMoney = firstVariation?.itemVariationData?.priceMoney;
    const priceInCents = priceMoney?.amount ? Number(priceMoney.amount) : 0;

    if (priceInCents === 0) { skipped++; continue; }

    // Resolve category name
    const categoryName = itemData.categoryId
      ? (categoryMap.get(itemData.categoryId) ?? "Other")
      : "Other";
    seenCategories.add(categoryName);

    // Resolve image URL
    const imageUrl = itemData.imageIds?.[0]
      ? (imageMap.get(itemData.imageIds[0]) ?? null)
      : null;

    const squareCatalogId = obj.id as string;

    // Check if already exists
    const existing = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(eq(menuItems.squareCatalogId, squareCatalogId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(menuItems)
        .set({
          name: itemData.name,
          description: itemData.description ?? null,
          category: categoryName,
          price: priceInCents,
          imageUrl: imageUrl ?? undefined,
        })
        .where(eq(menuItems.squareCatalogId, squareCatalogId));
      updated++;
    } else {
      await db.insert(menuItems).values({
        squareCatalogId,
        name: itemData.name,
        description: itemData.description ?? null,
        category: categoryName,
        price: priceInCents,
        imageUrl: imageUrl ?? undefined,
        isAvailable: true,
        sortOrder: 0,
        isTodaysSpecial: false,
      });
      imported++;
    }
  }

  return {
    imported,
    updated,
    skipped,
    categories: Array.from(seenCategories),
  };
}
