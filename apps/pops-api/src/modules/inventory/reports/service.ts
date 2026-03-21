/**
 * Inventory reports service — warranty tracking and dashboard queries.
 */
import { isNotNull } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { homeInventory } from "@pops/db-types";
import type { InventoryRow } from "../items/types.js";
import { getDb } from "../../../db.js";
import type { DashboardSummary, RecentItem } from "./types.js";

/** Warranty "expiring soon" window in days. */
const WARRANTY_WINDOW_DAYS = 90;

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

/**
 * Get dashboard summary: item count, total values, expiring warranties,
 * and recently added items.
 */
export function getDashboard(): DashboardSummary {
  const db = getDb();

  const summary = db
    .prepare(
      `SELECT
        COUNT(*) as itemCount,
        COALESCE(SUM(replacement_value), 0) as totalReplacementValue,
        COALESCE(SUM(resale_value), 0) as totalResaleValue
      FROM home_inventory`
    )
    .get() as {
    itemCount: number;
    totalReplacementValue: number;
    totalResaleValue: number;
  };

  const now = new Date();
  const cutoff = new Date(now.getTime() + WARRANTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString().split("T")[0];
  const cutoffIso = cutoff.toISOString().split("T")[0];

  const warrantyResult = db
    .prepare(
      `SELECT COUNT(*) as cnt
      FROM home_inventory
      WHERE warranty_expires IS NOT NULL
        AND warranty_expires >= ?
        AND warranty_expires <= ?`
    )
    .get(nowIso, cutoffIso) as { cnt: number };

  const recentRows = db
    .prepare(
      `SELECT id, item_name as itemName, type, last_edited_time as lastEditedTime
      FROM home_inventory
      ORDER BY last_edited_time DESC
      LIMIT 5`
    )
    .all() as RecentItem[];

  return {
    itemCount: summary.itemCount,
    totalReplacementValue: Math.round(summary.totalReplacementValue * 100) / 100,
    totalResaleValue: Math.round(summary.totalResaleValue * 100) / 100,
    warrantiesExpiringSoon: warrantyResult.cnt,
    recentlyAdded: recentRows,
  };
}
