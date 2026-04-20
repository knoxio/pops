import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';

/**
 * Inventory reports service — warranty tracking and insurance report queries.
 */
import { homeInventory, itemDocuments, locations } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type { InventoryRow } from '../items/types.js';
import type { DashboardSummary, RecentItem, ValueBreakdownEntry } from './types.js';

export {
  getInsuranceReport,
  type InsuranceReportGroup,
  type InsuranceReportItem,
  type InsuranceReportOptions,
  type InsuranceReportResult,
} from './insurance-report.js';

/** Warranty "expiring soon" window in days. */
const WARRANTY_WINDOW_DAYS = 90;

/**
 * Get dashboard summary: item count, total values, expiring warranties,
 * and recently added items.
 */
export function getDashboard(): DashboardSummary {
  const db = getDrizzle();

  const [summary] = db
    .select({
      itemCount: count(),
      totalReplacementValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      totalResaleValue: sql<number>`COALESCE(SUM(${homeInventory.resaleValue}), 0)`,
    })
    .from(homeInventory)
    .all();

  const now = new Date();
  const cutoff = new Date(now.getTime() + WARRANTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString().split('T')[0] ?? '';
  const cutoffIso = cutoff.toISOString().split('T')[0] ?? '';

  const [warrantyResult] = db
    .select({ cnt: count() })
    .from(homeInventory)
    .where(
      and(
        isNotNull(homeInventory.warrantyExpires),
        gte(homeInventory.warrantyExpires, nowIso),
        lte(homeInventory.warrantyExpires, cutoffIso)
      )
    )
    .all();

  const recentRows = db
    .select({
      id: homeInventory.id,
      itemName: homeInventory.itemName,
      type: homeInventory.type,
      assetId: homeInventory.assetId,
      lastEditedTime: homeInventory.lastEditedTime,
    })
    .from(homeInventory)
    .orderBy(desc(homeInventory.lastEditedTime))
    .limit(5)
    .all();

  return {
    itemCount: summary?.itemCount ?? 0,
    totalReplacementValue: Math.round((summary?.totalReplacementValue ?? 0) * 100) / 100,
    totalResaleValue: Math.round((summary?.totalResaleValue ?? 0) * 100) / 100,
    warrantiesExpiringSoon: warrantyResult?.cnt ?? 0,
    recentlyAdded: recentRows as RecentItem[],
  };
}

export interface WarrantyListItem extends InventoryRow {
  warrantyDocumentId: number | null;
}

/** List all inventory items that have a warranty expiry date, sorted by expiry. */
export function listWarrantyItems(): WarrantyListItem[] {
  const db = getDrizzle();
  const rows = db
    .select({
      item: homeInventory,
      warrantyDocumentId: itemDocuments.paperlessDocumentId,
    })
    .from(homeInventory)
    .leftJoin(
      itemDocuments,
      and(eq(itemDocuments.itemId, homeInventory.id), eq(itemDocuments.documentType, 'warranty'))
    )
    .where(isNotNull(homeInventory.warrantyExpires))
    .orderBy(homeInventory.warrantyExpires)
    .all();
  return rows.map((r) => ({ ...r.item, warrantyDocumentId: r.warrantyDocumentId ?? null }));
}

// ---------------------------------------------------------------------------
// Value breakdown
// ---------------------------------------------------------------------------

/**
 * Get replacement value breakdown grouped by location.
 */
export function getValueByLocation(): ValueBreakdownEntry[] {
  const db = getDrizzle();

  return db
    .select({
      name: sql<string>`COALESCE(${locations.name}, 'Unassigned')`,
      totalValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      itemCount: count(),
      key: sql<string | null>`${locations.id}`,
    })
    .from(homeInventory)
    .leftJoin(locations, eq(homeInventory.locationId, locations.id))
    .groupBy(sql`COALESCE(${locations.name}, 'Unassigned')`, locations.id)
    .orderBy(desc(sql`COALESCE(SUM(${homeInventory.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}

/**
 * Get replacement value breakdown grouped by item type.
 */
export function getValueByType(): ValueBreakdownEntry[] {
  const db = getDrizzle();

  return db
    .select({
      name: sql<string>`COALESCE(${homeInventory.type}, 'Uncategorized')`,
      totalValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      itemCount: count(),
    })
    .from(homeInventory)
    .groupBy(sql`COALESCE(${homeInventory.type}, 'Uncategorized')`)
    .orderBy(desc(sql`COALESCE(SUM(${homeInventory.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}
