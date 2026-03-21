/**
 * Inventory reports service — warranty tracking queries.
 */
import { isNotNull } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { homeInventory } from "@pops/db-types";
import type { InventoryRow } from "../items/types.js";

/** List all inventory items that have a warranty expiry date, sorted by expiry. */
export function listWarrantyItems(): InventoryRow[] {
  const db = getDrizzle();
  return db
    .select()
    .from(homeInventory)
    .where(isNotNull(homeInventory.warrantyExpires))
    .orderBy(homeInventory.warrantyExpires)
    .all();
}
