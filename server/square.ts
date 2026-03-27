/**
 * Square integration helpers
 * - OAuth token exchange
 * - Catalog sync (ITEM + ITEM_VARIATION + CATEGORY + MODIFIER_LIST)
 *
 * Uses Square Node.js SDK v44 (SquareClient / SquareEnvironment)
 * - catalog.list() returns Promise<Page<CatalogObject>> — iterate with for-await
 * - merchants.get({ merchantId }) takes an object, not a string
 */

import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "./db";
import { squareConnections, menuItems, modifierLists, modifiers, menuItemModifierLists } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

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
  modifierListsSynced: number;
  modifiersSynced: number;
}

type RawCatalogObject = Record<string, unknown>;

/**
 * Pull ITEM + ITEM_VARIATION + CATEGORY + MODIFIER_LIST from Square Catalog API
 * and upsert into the FÜDA menuItems, modifierLists, modifiers, and
 * menuItemModifierLists tables.
 */
export async function syncSquareCatalog(accessToken: string): Promise<SyncResult> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });

  // 1. Fetch all catalog objects (auto-paginates)
  const allObjects: RawCatalogObject[] = [];
  const page = await client.catalog.list({
    types: "ITEM,ITEM_VARIATION,CATEGORY,IMAGE,MODIFIER_LIST",
  });
  for await (const obj of page) {
    allObjects.push(obj as unknown as RawCatalogObject);
  }

  // 2. Build lookup maps
  const categoryMap = new Map<string, string>(); // squareId → name
  const imageMap = new Map<string, string>();     // squareId → url

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

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 3. Sync MODIFIER_LIST objects first so we have their DB IDs for linking
  let modifierListsSynced = 0;
  let modifiersSynced = 0;

  // squareModifierListId → DB row id
  const modifierListDbIdMap = new Map<string, number>();

  for (const obj of allObjects) {
    if (obj.type !== "MODIFIER_LIST") continue;

    const squareModifierListId = obj.id as string;
    const listData = obj.modifierListData as {
      name?: string;
      selectionType?: "SINGLE" | "MULTIPLE";
      modifiers?: Array<{
        id: string;
        modifierData?: {
          name?: string;
          priceMoney?: { amount?: bigint | number | string };
          ordinal?: number;
        };
      }>;
    } | undefined;

    if (!listData?.name) continue;

    const selectionType = listData.selectionType === "MULTIPLE" ? "MULTIPLE" : "SINGLE";

    // Upsert modifier list
    const existingList = await db
      .select({ id: modifierLists.id })
      .from(modifierLists)
      .where(eq(modifierLists.squareModifierListId, squareModifierListId))
      .limit(1);

    let listDbId: number;
    if (existingList.length > 0) {
      await db
        .update(modifierLists)
        .set({ name: listData.name, selectionType })
        .where(eq(modifierLists.squareModifierListId, squareModifierListId));
      listDbId = existingList[0].id;
    } else {
      const inserted = await db.insert(modifierLists).values({
        squareModifierListId,
        name: listData.name,
        selectionType,
      });
      listDbId = Number((inserted as unknown as [{ insertId: number }])[0].insertId);
      modifierListsSynced++;
    }

    modifierListDbIdMap.set(squareModifierListId, listDbId);

    // Upsert each modifier in this list
    if (listData.modifiers) {
      for (const mod of listData.modifiers) {
        if (!mod.id || !mod.modifierData?.name) continue;
        const priceInCents = mod.modifierData.priceMoney?.amount
          ? Number(mod.modifierData.priceMoney.amount)
          : 0;
        const ordinal = mod.modifierData.ordinal ?? 0;

        const existingMod = await db
          .select({ id: modifiers.id })
          .from(modifiers)
          .where(eq(modifiers.squareModifierId, mod.id))
          .limit(1);

        if (existingMod.length > 0) {
          await db
            .update(modifiers)
            .set({ name: mod.modifierData.name, priceInCents, ordinal })
            .where(eq(modifiers.squareModifierId, mod.id));
        } else {
          await db.insert(modifiers).values({
            squareModifierId: mod.id,
            modifierListId: listDbId,
            name: mod.modifierData.name,
            priceInCents,
            ordinal,
          });
          modifiersSynced++;
        }
      }
    }
  }

  // 4. Process ITEM objects
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
      categories?: Array<{ id: string; ordinal?: number }>;
      imageIds?: string[];
      modifierListInfo?: Array<{
        modifierListId: string;
        enabled?: boolean;
      }>;
      variations?: Array<{
        id: string;
        itemVariationData?: {
          name?: string;
          priceMoney?: { amount?: bigint | number | string; currency?: string };
        };
      }>;
    } | undefined;

    if (!itemData?.name) { skipped++; continue; }

    const firstVariation = itemData.variations?.[0];
    const priceMoney = firstVariation?.itemVariationData?.priceMoney;
    const priceInCents = priceMoney?.amount ? Number(priceMoney.amount) : 0;

    if (priceInCents === 0) { skipped++; continue; }

    // Resolve category
    let categoryName = "Other";
    if (itemData.categoryId) {
      categoryName = categoryMap.get(itemData.categoryId) ?? "Other";
    } else if (itemData.categories && itemData.categories.length > 0) {
      categoryName = categoryMap.get(itemData.categories[0].id) ?? "Other";
    }
    seenCategories.add(categoryName);

    // Resolve image URL
    const imageUrl = itemData.imageIds?.[0]
      ? (imageMap.get(itemData.imageIds[0]) ?? null)
      : null;

    const squareCatalogId = obj.id as string;

    // Upsert menu item
    let menuItemDbId: number;
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
      menuItemDbId = existing[0].id;
      updated++;
    } else {
      const ins = await db.insert(menuItems).values({
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
      menuItemDbId = Number((ins as unknown as [{ insertId: number }])[0].insertId);
      imported++;
    }

    // 5. Link modifier lists to this menu item
    if (itemData.modifierListInfo && itemData.modifierListInfo.length > 0) {
      // Remove old links for this item
      await db
        .delete(menuItemModifierLists)
        .where(eq(menuItemModifierLists.menuItemId, menuItemDbId));

      for (const info of itemData.modifierListInfo) {
        const listDbId = modifierListDbIdMap.get(info.modifierListId);
        if (!listDbId) continue; // modifier list not synced (shouldn't happen)
        await db.insert(menuItemModifierLists).values({
          menuItemId: menuItemDbId,
          modifierListId: listDbId,
          isEnabled: info.enabled !== false,
        });
      }
    }
  }

  return {
    imported,
    updated,
    skipped,
    categories: Array.from(seenCategories),
    modifierListsSynced,
    modifiersSynced,
  };
}

/**
 * Fetch all modifier lists (with their modifiers) for a given menu item DB ID.
 * Used by the menu/order API to return available add-ons.
 */
export async function getMenuItemModifiers(menuItemDbId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get linked modifier list IDs
  const links = await db
    .select({ modifierListId: menuItemModifierLists.modifierListId, isEnabled: menuItemModifierLists.isEnabled })
    .from(menuItemModifierLists)
    .where(eq(menuItemModifierLists.menuItemId, menuItemDbId));

  if (links.length === 0) return [];

  const enabledListIds = links.filter(l => l.isEnabled).map(l => l.modifierListId);
  if (enabledListIds.length === 0) return [];

  // Fetch modifier lists
  const lists = await db
    .select()
    .from(modifierLists)
    .where(inArray(modifierLists.id, enabledListIds));

  // Fetch all modifiers for these lists
  const mods = await db
    .select()
    .from(modifiers)
    .where(inArray(modifiers.modifierListId, enabledListIds));

  // Group modifiers by list
  return lists.map(list => ({
    id: list.id,
    name: list.name,
    selectionType: list.selectionType,
    modifiers: mods
      .filter(m => m.modifierListId === list.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(m => ({
        id: m.id,
        name: m.name,
        priceInCents: m.priceInCents,
      })),
  }));
}
