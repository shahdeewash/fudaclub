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
  const scopes = [
    "ITEMS_READ",
    "MERCHANT_PROFILE_READ",
    "ORDERS_WRITE",
    "ORDERS_READ",
    "PAYMENTS_WRITE",
    "PAYMENTS_READ",
    "DEVICE_CREDENTIAL_MANAGEMENT",
    "DEVICES_READ", // needed for Devices API (Check Terminal Status, Auto-Detect)
  ].join("+");
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
 * @param menuName  Name(s) of the Square menu(s) (MENU_CATEGORY) to filter by.
 *                  Pass a string, array of strings, or null to sync ALL items.
 *                  If a menu is a parent (e.g. "Eatfuda"), all child menus are
 *                  automatically included. Default: "Eatfuda".
 */
export async function syncSquareCatalog(
  accessToken: string,
  menuName: string | string[] | null = "Eatfuda"
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

  // ── Step 2: Resolve menu filter category IDs ─────────────────────────────
  // Supports: null (all), single string, or array of strings.
  // For each name, recursively collects the root + ALL descendants so that
  // adding a new sub-menu under Eatfuda in Square is picked up automatically.
  let filterCategoryIds: string[] = [];
  const catEntries = Array.from(categoryInfoMap.entries());

  /** Recursively collect a category ID and all its descendants */
  function collectDescendants(rootId: string): string[] {
    const result: string[] = [rootId];
    for (const [id, info] of catEntries) {
      if (info.parentId === rootId) {
        result.push(...collectDescendants(id));
      }
    }
    return result;
  }

  /** Resolve a single menu name to its category IDs (root + all descendants) */
  function resolveMenuName(name: string): string[] {
    const nameLower = name.toLowerCase();
    // Prefer MENU_CATEGORY match first
    for (const [id, info] of catEntries) {
      if (
        info.name.toLowerCase() === nameLower &&
        (info.categoryType === "MENU_CATEGORY" || info.categoryType === "2")
      ) {
        const ids = collectDescendants(id);
        console.log(`[Square Sync] Found menu "${name}" (MENU_CATEGORY) with ${ids.length} category IDs`);
        return ids;
      }
    }
    // Fallback: any category with that name
    for (const [id, info] of catEntries) {
      if (info.name.toLowerCase() === nameLower) {
        const ids = collectDescendants(id);
        console.log(`[Square Sync] Matched "${name}" as regular category with ${ids.length} IDs`);
        return ids;
      }
    }
    console.warn(`[Square Sync] No category named "${name}" found, skipping.`);
    return [];
  }

  if (menuName !== null) {
    const names = Array.isArray(menuName) ? menuName : [menuName];
    const idSet = new Set<string>();
    for (const name of names) {
      for (const id of resolveMenuName(name)) {
        idSet.add(id);
      }
    }
    filterCategoryIds = Array.from(idSet);
    console.log(`[Square Sync] Total filter: ${filterCategoryIds.length} category IDs across ${names.length} menu(s): ${names.join(", ")}`);
    if (filterCategoryIds.length === 0) {
      console.warn(`[Square Sync] No matching categories found. Syncing all items.`);
    }
  }

  // ── Step 3: Fetch ITEM objects — filtered by menu category IDs if found ────
  const filteredItems: RawCatalogObject[] = [];
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
        filteredItems.push(item as RawCatalogObject);
        allObjects.push(item as RawCatalogObject);
      }
      cursor = searchRes.cursor;
    } while (cursor);
  } else {
    // No filter — fetch all ITEM objects
    const itemPage = await client.catalog.list({ types: "ITEM" });
    for await (const obj of itemPage) {
      filteredItems.push(obj as unknown as RawCatalogObject);
      allObjects.push(obj as unknown as RawCatalogObject);
    }
  }

  // ── Step 4: Fetch only MODIFIER_LISTs referenced by filtered items + IMAGEs ──
  // Collect the modifier list IDs referenced by our filtered items
  const neededModifierListIds = new Set<string>();
  const neededImageIds = new Set<string>();
  for (const obj of filteredItems) {
    const itemData = obj.itemData as any;
    if (itemData?.modifierListInfo) {
      for (const m of itemData.modifierListInfo) {
        if (m.modifierListId) neededModifierListIds.add(m.modifierListId);
      }
    }
    if (itemData?.imageIds) {
      for (const imgId of itemData.imageIds) {
        neededImageIds.add(imgId);
      }
    }
  }

  // Batch-fetch only the needed modifier lists and images via batchRetrieve
  const idsToFetch = [...Array.from(neededModifierListIds), ...Array.from(neededImageIds)];
  if (idsToFetch.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < idsToFetch.length; i += batchSize) {
      const batch = idsToFetch.slice(i, i + batchSize);
      try {
        const batchRes = await (client.catalog as any).batchGet({ objectIds: batch });
        const objs: RawCatalogObject[] = batchRes.objects ?? [];
        for (const obj of objs) {
          allObjects.push(obj as RawCatalogObject);
        }
      } catch {
        // If batch fetch fails, skip modifier lists for this sync
      }
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
      // Update path — DELIBERATELY does not touch coinEligible. That flag is
      // owned by the admin dashboard (and the migration backfill); preserving
      // it here means a Square re-sync never undoes a manual override.
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
      // New item — derive initial coinEligible from category match.
      // Admin can flip it via dashboard later; subsequent syncs won't touch.
      const { FUDA_CLUB } = await import("./stripe-products");
      const ineligibleCats = new Set(
        FUDA_CLUB.coinIneligibleCategories.map(c => c.toLowerCase())
      );
      const initialCoinEligible = !ineligibleCats.has((categoryName ?? "").toLowerCase().trim());
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
        coinEligible: initialCoinEligible,
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
  specialInstructions?: string | null,
  customerName?: string | null,
  customerPhone?: string | null
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
        state: "OPEN",  // GPT fix: explicit OPEN state makes order visible in POS
        source: { name: "FÜDA" },  // GPT fix: source name helps POS routing
        lineItems: squareLineItems,
        // GST (10% inclusive) — Australian standard: GST = 1/11 of the total
        // Square applies this as an INCLUSIVE tax so the printed receipt shows
        // the GST component without changing the total amount.
        taxes: [
          {
            uid: "GST",
            name: "GST (10%)",
            percentage: "10",
            type: "INCLUSIVE",
            scope: "ORDER",
          },
        ],
        // Fulfillment is required for Square POS to show the order in the Orders tab
        // and trigger auto-print on connected receipt printers
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickupDetails: {
              recipient: {
                displayName: customerName ?? `Order ${fudaOrderNumber}`,
                ...(customerPhone ? { phoneNumber: customerPhone } : {}),
              },
              // Pickup ASAP — set to 15 minutes from now
              pickupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              note: specialInstructions ?? undefined,
            },
          },
        ],
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

    // ─── Record an EXTERNAL payment so the order appears in Square POS ──────
    // Square only shows orders in POS/KDS AFTER they are paid.
    // Since FÜDA collects payment via Stripe/Coins (not Square), we record
    // an EXTERNAL payment to mark the order as paid in Square.
    const orderTotal = response?.order?.totalMoney?.amount;
    const totalAmount = typeof orderTotal === "bigint" ? orderTotal : BigInt(orderTotal ?? 0);

    try {
      const paymentRes = await (client.payments as any).create({
        sourceId: "EXTERNAL",
        idempotencyKey: `fuda-pay-${fudaOrderId}-${Date.now()}`,
        amountMoney: {
          amount: totalAmount,
          currency: "AUD",
        },
        orderId: squareOrderId,
        locationId: conn.locationId,
        externalDetails: {
          type: "OTHER",
          source: "FÜDA App",
          sourceFeeMoney: { amount: BigInt(0), currency: "AUD" },
        },
        note: `FÜDA order ${fudaOrderNumber} — paid via app`,
      });

      const paymentId = paymentRes?.payment?.id;
      if (paymentId) {
        console.log(`[Square Orders] External payment recorded: ${paymentId} for order ${squareOrderId}`);
      } else {
        console.warn("[Square Orders] Payment created but no ID returned:", paymentRes);
      }
    } catch (payErr: any) {
      // Non-fatal: order was created, payment recording failed
      // Order may still appear in Square Dashboard but not POS
      console.error("[Square Orders] Failed to record external payment:", payErr?.message ?? payErr);
    }
    // ────────────────────────────────────────────────────────────────────────

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

// ─── Square Terminal helpers ─────────────────────────────────────────────────

/**
 * Fetch the first paired Square Terminal device for this account and store
 * its device ID in the squareConnections row. Called automatically after
 * OAuth connect and before each receipt print if no device ID is stored.
 *
 * Returns the device ID string, or null if no terminal is paired.
 */
/**
 * Look up the configured Square Terminal device and return its current status.
 * No print job sent — just queries Square's Devices API for the paired device's
 * metadata so admin can verify the device is reachable without being at the store.
 */
export async function getTerminalStatus(
  accessToken: string,
  expectedDeviceId: string | null
): Promise<{
  found: boolean;
  deviceId: string | null;
  deviceName: string | null;
  category: string | null;
  attributes: Record<string, unknown> | null;
  reachable: boolean;
  message: string;
}> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });
  try {
    const res = await (client.devices as any).list({});
    const devices: Array<any> = res?.devices ?? [];

    if (!expectedDeviceId) {
      return {
        found: false,
        deviceId: null,
        deviceName: null,
        category: null,
        attributes: null,
        reachable: false,
        message: `No terminal device ID is stored. Square reports ${devices.length} paired device(s); pick one in admin or click Auto-detect.`,
      };
    }

    const matched = devices.find(d => d.id === expectedDeviceId);
    if (!matched) {
      return {
        found: false,
        deviceId: expectedDeviceId,
        deviceName: null,
        category: null,
        attributes: null,
        reachable: false,
        message: `Stored device ID ${expectedDeviceId} is not in the list of paired devices Square knows about. The terminal may have been unpaired or replaced — re-pair on the device or click Auto-detect.`,
      };
    }

    return {
      found: true,
      deviceId: matched.id,
      deviceName: matched.name ?? null,
      category: matched.status?.category ?? matched.attributes?.type ?? null,
      attributes: matched.attributes ?? null,
      reachable: true,
      message: `Device "${matched.name ?? matched.id}" is paired with Square${matched.status?.category ? ` as ${matched.status.category}` : ""}. Square will queue the next receipt for this device when an order is placed; if the terminal is powered on and online, it'll print immediately.`,
    };
  } catch (err: any) {
    return {
      found: false,
      deviceId: expectedDeviceId,
      deviceName: null,
      category: null,
      attributes: null,
      reachable: false,
      message: `Couldn't query Square Devices API: ${err?.message ?? "unknown error"}. The Square access token may have expired — try reconnecting Square.`,
    };
  }
}

export async function fetchAndStoreTerminalDeviceId(
  accessToken: string,
  connectionId: number
): Promise<string | null> {
  const client = new SquareClient({ token: accessToken, environment: SQ_ENV });
  try {
    // List devices — returns Square Terminal devices paired to this account
    // SDK v44: client.devices.list() (not listDevices)
    const res = await (client.devices as any).list({});
    const devices: Array<{ id?: string; name?: string; status?: { category?: string } }> =
      res?.devices ?? [];

    // Prefer a device whose category is TERMINAL
    const terminal = devices.find(
      d => d.status?.category === "TERMINAL" || d.id?.startsWith("device:")
    ) ?? devices[0];

    if (!terminal?.id) {
      console.warn("[Square Terminal] No paired terminal device found.");
      return null;
    }

    const deviceId = terminal.id;
    const db = await getDb();
    if (db) {
      await db
        .update(squareConnections)
        .set({ terminalDeviceId: deviceId })
        .where(eq(squareConnections.id, connectionId));
    }

    console.log(`[Square Terminal] Stored device ID: ${deviceId} (${terminal.name ?? "unnamed"})`);
    return deviceId;
  } catch (err) {
    console.error("[Square Terminal] Failed to fetch terminal devices:", err);
    return null;
  }
}

/**
 * Trigger a receipt print on the connected Square Terminal for a given
 * Square Order ID. Uses CreateTerminalCheckout with the order_id so the
 * terminal prints a fully itemised receipt.
 *
 * - Non-blocking: errors are logged but never thrown.
 * - If no terminal device is configured, attempts to auto-discover one first.
 *
 * @returns The Square Terminal checkout ID on success, or null on failure.
 */
export async function printReceiptOnTerminal(
  fudaOrderId: number,
  squareOrderId: string,
  totalAmountInCents: number
): Promise<string | null> {
  const connections = await getAllSquareConnections();
  if (connections.length === 0) {
    console.warn("[Square Terminal] No Square connection — skipping receipt print.");
    return null;
  }

  const conn = connections[0];
  if (!conn.accessToken || !conn.locationId) {
    console.warn("[Square Terminal] Missing accessToken or locationId — skipping receipt print.");
    return null;
  }

  // Auto-discover device ID if not stored yet
  let deviceId = conn.terminalDeviceId ?? null;
  if (!deviceId) {
    deviceId = await fetchAndStoreTerminalDeviceId(conn.accessToken, conn.id);
    if (!deviceId) {
      console.warn("[Square Terminal] No terminal device ID available — skipping receipt print.");
      return null;
    }
  }

  const client = new SquareClient({ token: conn.accessToken, environment: SQ_ENV });
  const idempotencyKey = `fuda-receipt-${fudaOrderId}-${Date.now()}`;

  try {
    const res = await (client.terminal as any).createTerminalCheckout({
      idempotencyKey,
      checkout: {
        amountMoney: {
          amount: BigInt(totalAmountInCents),
          currency: "AUD",
        },
        orderId: squareOrderId,
        deviceOptions: {
          deviceId,
          showItemizedCart: true,
          skipReceiptScreen: false, // show receipt options to buyer
        },
        note: `FÜDA Order #${fudaOrderId}`,
        paymentType: "CARD_PRESENT",
      },
    });

    const checkoutId = res?.checkout?.id as string | undefined;
    if (!checkoutId) {
      console.warn("[Square Terminal] Checkout created but no ID returned:", res);
      return null;
    }

    console.log(`[Square Terminal] Receipt checkout ${checkoutId} sent to device ${deviceId} for order ${fudaOrderId}`);
    return checkoutId;
  } catch (err: any) {
    // Log but never throw — receipt printing is best-effort
    console.error(`[Square Terminal] Failed to create terminal checkout for order ${fudaOrderId}:`, err?.message ?? err);
    return null;
  }
}
