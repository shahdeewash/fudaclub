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
import { squareConnections, menuItems, modifierLists, modifiers, menuItemModifierLists, orders } from "../drizzle/schema";
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

export async function getAllSquareConnections() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(squareConnections);
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
 *
 * @param accessToken  Square OAuth access token
 * @param menuName  Name of the Square menu (MENU_CATEGORY) to filter by.
 *                  Default: "FUDA Lunch". Pass null to sync ALL items.
 */
export async function syncSquareCatalog(
  accessToken: string,
  menuName: string | null = "FUDA Lunch"
): Promise<SyncResult> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });

  // ── Step 1: Fetch all CATEGORY objects (includes MENU_CATEGORY) ──────────
  const allObjects: RawCatalogObject[] = [];

  const categoryPage = await client.catalog.list({ types: "CATEGORY" });
  for await (const obj of categoryPage) {
    allObjects.push(obj as unknown as RawCatalogObject);
  }

  // Build full category map: squareId → { name, categoryType, parentId }
  type CatInfo = { name: string; categoryType: string; parentId: string | null };
  const categoryInfoMap = new Map<string, CatInfo>();
  for (const obj of allObjects) {
    if (obj.type !== "CATEGORY" || !obj.id) continue;
    const catData = obj.categoryData as {
      name?: string;
      categoryType?: string;
      parentCategory?: { id?: string };
    } | undefined;
    categoryInfoMap.set(obj.id as string, {
      name: catData?.name ?? "Other",
      categoryType: catData?.categoryType ?? "REGULAR_CATEGORY",
      parentId: catData?.parentCategory?.id ?? null,
    });
  }

  // ── Step 2: Find the FUDA Lunch menu root category ───────────────────────
  // Square menus are CATEGORY objects with categoryType = "MENU_CATEGORY"
  let filterCategoryIds: string[] = [];
  const catEntries = Array.from(categoryInfoMap.entries());

  if (menuName) {
    // Find root menu category named menuName (case-insensitive)
    let rootMenuCategoryId: string | null = null;
    for (const [id, info] of catEntries) {
      if (
        info.name.toLowerCase() === menuName.toLowerCase() &&
        (info.categoryType === "MENU_CATEGORY" || info.categoryType === "2")
      ) {
        rootMenuCategoryId = id;
        break;
      }
    }

    if (rootMenuCategoryId) {
      console.log(`[Square Sync] Found menu "${menuName}" with ID: ${rootMenuCategoryId}`);
      // Collect the root + all child categories under this menu
      filterCategoryIds = [rootMenuCategoryId];
      for (const [id, info] of catEntries) {
        if (info.parentId === rootMenuCategoryId) {
          filterCategoryIds.push(id);
        }
      }
      console.log(`[Square Sync] Filtering by ${filterCategoryIds.length} category IDs under "${menuName}"`);
    } else {
      // Menu not found — try matching by name against ALL categories (regular or menu)
      console.warn(`[Square Sync] Menu "${menuName}" not found as MENU_CATEGORY. Trying regular category match...`);
      for (const [id, info] of catEntries) {
        if (info.name.toLowerCase() === menuName.toLowerCase()) {
          filterCategoryIds = [id];
          // Also include child categories
          for (const [cid, cinfo] of catEntries) {
            if (cinfo.parentId === id) filterCategoryIds.push(cid);
          }
          console.log(`[Square Sync] Matched "${menuName}" as regular category, using ${filterCategoryIds.length} IDs`);
          break;
        }
      }
      if (filterCategoryIds.length === 0) {
        console.warn(`[Square Sync] No category named "${menuName}" found. Syncing all items.`);
      }
    }
  }

  // ── Step 3: Fetch MODIFIER_LIST and IMAGE objects ────────────────────────
  const supportingPage = await client.catalog.list({ types: "MODIFIER_LIST,IMAGE" });
  for await (const obj of supportingPage) {
    allObjects.push(obj as unknown as RawCatalogObject);
  }

  // ── Step 4: Fetch ITEM objects — filtered by menu category IDs if found ──
  if (filterCategoryIds.length > 0) {
    // Use SearchCatalogItems with category_ids filter
    let cursor: string | undefined;
    do {
      const searchRes = await (client.catalog as any).searchItems({
        categoryIds: filterCategoryIds,
        limit: 100,
        cursor,
      });
      const items: RawCatalogObject[] = searchRes.items ?? [];
      for (const item of items) {
        allObjects.push(item as RawCatalogObject);
      }
      cursor = searchRes.cursor;
    } while (cursor);
  } else {
    // No filter — fetch all ITEM objects
    const itemPage = await client.catalog.list({ types: "ITEM" });
    for await (const obj of itemPage) {
      allObjects.push(obj as unknown as RawCatalogObject);
    }
  }

  // ── Step 5: Build lookup maps ─────────────────────────────────────────────
  // Simple name map for item category resolution
  const categoryMap = new Map<string, string>(); // squareId → name
  for (const [id, info] of catEntries) {
    categoryMap.set(id, info.name);
  }

  const imageMap = new Map<string, string>();     // squareId → url
  for (const obj of allObjects) {
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
    const squareVariationId = firstVariation?.id as string | undefined;
    const priceMoney = firstVariation?.itemVariationData?.priceMoney;
    const priceInCents = priceMoney?.amount ? Number(priceMoney.amount) : 0;

    // Allow $0 items (e.g. Bubble Tea with price set in Square modifiers/add-ons)

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
          squareVariationId: squareVariationId ?? undefined,
        })
        .where(eq(menuItems.squareCatalogId, squareCatalogId));
      menuItemDbId = existing[0].id;
      updated++;
    } else {
      const ins = await db.insert(menuItems).values({
        squareCatalogId,
        squareVariationId: squareVariationId ?? undefined,
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

// ─── Square Orders API ───────────────────────────────────────────────────────

export interface SquareOrderLineItem {
  menuItemId: number;
  itemName: string;
  quantity: number;
  unitPriceInCents: number;
  variationId?: string | null;
  modifierNote?: string | null;
}

/**
 * Push a FÜDA order to Square Orders API so it prints to the kitchen printer.
 *
 * - Uses the first Square connection found (admin's connected account).
 * - Requires `squareVariationId` on menu items (populated by syncSquareCatalog).
 * - Items without a variationId are sent as ad-hoc line items with a custom name.
 * - Returns the Square Order ID on success, or null if no Square connection exists.
 */
export async function createSquareOrderForPrinting(
  fudaOrderId: number,
  fudaOrderNumber: string,
  lineItems: SquareOrderLineItem[],
  specialInstructions?: string | null
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  // Get any active Square connection
  const connections = await getAllSquareConnections();
  if (connections.length === 0) {
    console.warn("[Square Orders] No Square connection found — skipping kitchen print.");
    return null;
  }

  const conn = connections[0];
  if (!conn.accessToken || !conn.locationId) {
    console.warn("[Square Orders] Missing accessToken or locationId — skipping kitchen print.");
    return null;
  }

  const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });

  // Build Square line items
  const squareLineItems = lineItems.map(item => {
    const baseItem: Record<string, unknown> = {
      quantity: item.quantity.toString(),
      basePriceMoney: {
        amount: BigInt(item.unitPriceInCents),
        currency: "AUD",
      },
      note: item.modifierNote ?? undefined,
    };

    if (item.variationId) {
      // Catalog-linked item — Square will look up the name from the catalog
      baseItem.catalogObjectId = item.variationId;
    } else {
      // Ad-hoc item — provide name manually
      baseItem.name = item.itemName;
    }

    return baseItem;
  });

  const idempotencyKey = `fuda-${fudaOrderId}-${Date.now()}`;

  try {
    const response = await (client.orders as any).create({
      order: {
        locationId: conn.locationId,
        referenceId: fudaOrderNumber,
        lineItems: squareLineItems,
        ...(specialInstructions
          ? { metadata: { specialInstructions } }
          : {}),
      },
      idempotencyKey,
    });

    const squareOrderId = response?.order?.id as string | undefined;
    if (!squareOrderId) {
      console.warn("[Square Orders] Order created but no ID returned:", response);
      return null;
    }

    // Persist the Square Order ID on the FÜDA order record
    await db
      .update(orders)
      .set({ squareOrderId })
      .where(eq(orders.id, fudaOrderId));

    console.log(`[Square Orders] Order ${fudaOrderNumber} pushed to Square as ${squareOrderId}`);
    return squareOrderId;
  } catch (err) {
    console.error("[Square Orders] Failed to create Square order:", err);
    return null;
  }
}
