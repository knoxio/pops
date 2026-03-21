/**
 * Inventory reports service — aggregate queries for dashboard and insurance report.
 */
import { getDb } from "../../../db.js";
import type {
  DashboardSummary,
  RecentItem,
  InsuranceReport,
  InsuranceReportItem,
  InsuranceReportLocationGroup,
} from "./types.js";

/** Warranty "expiring soon" window in days. */
const WARRANTY_WINDOW_DAYS = 90;

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

/**
 * Get insurance report — items grouped by location with values and warranty status.
 * Optionally filter to a single location and its children.
 */
export function getInsuranceReport(locationId?: string): InsuranceReport {
  const db = getDb();
  const nowIso = new Date().toISOString().split("T")[0];

  // Build query: join items with locations and first photo
  let query = `
    SELECT
      hi.id,
      hi.item_name AS itemName,
      hi.asset_id AS assetId,
      hi.brand,
      hi.model,
      hi.condition,
      hi.warranty_expires AS warrantyExpires,
      hi.replacement_value AS replacementValue,
      hi.resale_value AS resaleValue,
      hi.location_id AS locationId,
      COALESCE(l.name, hi.location, 'Unassigned') AS locationName,
      (SELECT ip.file_path FROM item_photos ip WHERE ip.item_id = hi.id ORDER BY ip.sort_order LIMIT 1) AS photoPath
    FROM home_inventory hi
    LEFT JOIN locations l ON l.id = hi.location_id
  `;

  const params: string[] = [];

  if (locationId) {
    // Include items in the specified location and all descendant locations
    query += `
      WHERE hi.location_id IN (
        WITH RECURSIVE loc_tree(id) AS (
          SELECT id FROM locations WHERE id = ?
          UNION ALL
          SELECT c.id FROM locations c JOIN loc_tree p ON c.parent_id = p.id
        )
        SELECT id FROM loc_tree
      )
    `;
    params.push(locationId);
  }

  query += ` ORDER BY locationName, hi.item_name`;

  interface RawRow {
    id: string;
    itemName: string;
    assetId: string | null;
    brand: string | null;
    model: string | null;
    condition: string | null;
    warrantyExpires: string | null;
    replacementValue: number | null;
    resaleValue: number | null;
    locationId: string | null;
    locationName: string;
    photoPath: string | null;
  }

  const rows = db.prepare(query).all(...params) as RawRow[];

  // Group by location
  const groupMap = new Map<string, InsuranceReportLocationGroup>();

  for (const row of rows) {
    const key = row.locationId ?? "__unassigned";

    let warrantyStatus: "active" | "expired" | "none" = "none";
    if (row.warrantyExpires) {
      warrantyStatus = row.warrantyExpires >= nowIso ? "active" : "expired";
    }

    const item: InsuranceReportItem = {
      id: row.id,
      itemName: row.itemName,
      assetId: row.assetId,
      brand: row.brand,
      model: row.model,
      condition: row.condition,
      warrantyExpires: row.warrantyExpires,
      warrantyStatus,
      replacementValue: row.replacementValue,
      resaleValue: row.resaleValue,
      photoPath: row.photoPath,
    };

    const group = groupMap.get(key);
    if (group) {
      group.items.push(item);
      group.totalReplacementValue += row.replacementValue ?? 0;
      group.totalResaleValue += row.resaleValue ?? 0;
    } else {
      groupMap.set(key, {
        locationId: row.locationId,
        locationName: row.locationName,
        items: [item],
        totalReplacementValue: row.replacementValue ?? 0,
        totalResaleValue: row.resaleValue ?? 0,
      });
    }
  }

  const locationGroups = Array.from(groupMap.values());

  // Round totals
  for (const g of locationGroups) {
    g.totalReplacementValue = Math.round(g.totalReplacementValue * 100) / 100;
    g.totalResaleValue = Math.round(g.totalResaleValue * 100) / 100;
  }

  const totals = {
    itemCount: rows.length,
    replacementValue: Math.round(
      locationGroups.reduce((sum, g) => sum + g.totalReplacementValue, 0) * 100
    ) / 100,
    resaleValue: Math.round(
      locationGroups.reduce((sum, g) => sum + g.totalResaleValue, 0) * 100
    ) / 100,
  };

  return { locations: locationGroups, totals };
}
