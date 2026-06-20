/**
 * Handler for the `search.*` sub-router — inventory's slice of unified search.
 *
 * Ported from `apps/pops-api/src/modules/inventory/items/search-adapter.ts`.
 * The monolith adapter read the shared `getInventoryDrizzle()` handle; here it
 * runs against the inventory pillar's OWN `InventoryDb`, where `homeInventory`
 * now lives. The TIERED ranking is preserved verbatim:
 *   1. exact assetId match           → 1.0  (matchField 'assetId', 'exact')
 *   2. assetId prefix (excl. exact)  → 0.9  (matchField 'assetId', 'prefix')
 *   3. itemName: exact 0.85 / prefix 0.7 / contains 0.5 (matchField 'itemName')
 * Tiers run in order against a shared `limit` budget; later tiers stop once the
 * budget is hit, name hits skip uris already seen, and the final list is sorted
 * descending by score and capped at the limit. `uri` keeps the
 * `/inventory/items/<id>` shape the monolith emitted.
 */
import { sql } from 'drizzle-orm';

import { homeInventory, type InventoryDb } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventorySearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof inventorySearchContract>;

const DEFAULT_LIMIT = 20;

type Row = typeof homeInventory.$inferSelect;

interface InventoryItemHitData extends Record<string, unknown> {
  itemName: string;
  assetId: string | null;
  location: string | null;
  type: string | null;
  condition: string | null;
}

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: 'exact' | 'prefix' | 'contains';
  data: InventoryItemHitData;
}

function rowToData(row: Row): InventoryItemHitData {
  return {
    itemName: row.itemName,
    assetId: row.assetId,
    location: row.location,
    type: row.type,
    condition: row.condition,
  };
}

/**
 * Mutable scan state threaded through the ranking tiers. Bundled into one
 * object so each tier stays under the 4-param lint cap — the monolith adapter
 * read a module-level db handle and so passed fewer args; here the pillar db
 * handle is injected, which is what pushes the count over.
 */
interface SearchScan {
  readonly db: InventoryDb;
  readonly lowerText: string;
  readonly limit: number;
  readonly hits: SearchHit[];
}

function searchAssetExact(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(sql`lower(${homeInventory.assetId}) = ${scan.lowerText}`)
    .all();
  for (const row of rows) {
    scan.hits.push({
      uri: `/inventory/items/${row.id}`,
      score: 1.0,
      matchField: 'assetId',
      matchType: 'exact',
      data: rowToData(row),
    });
  }
}

function searchAssetPrefix(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(
      sql`lower(${homeInventory.assetId}) like ${scan.lowerText + '%'} and lower(${homeInventory.assetId}) != ${scan.lowerText}`
    )
    .all();
  for (const row of rows) {
    if (scan.hits.length >= scan.limit) break;
    scan.hits.push({
      uri: `/inventory/items/${row.id}`,
      score: 0.9,
      matchField: 'assetId',
      matchType: 'prefix',
      data: rowToData(row),
    });
  }
}

function classifyNameMatch(
  lowerName: string,
  lowerText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } {
  if (lowerName === lowerText) return { score: 0.85, matchType: 'exact' };
  if (lowerName.startsWith(lowerText)) return { score: 0.7, matchType: 'prefix' };
  return { score: 0.5, matchType: 'contains' };
}

function searchByName(scan: SearchScan): void {
  const rows = scan.db
    .select()
    .from(homeInventory)
    .where(sql`lower(${homeInventory.itemName}) like ${'%' + scan.lowerText + '%'}`)
    .all();

  const seenIds = new Set(scan.hits.map((h) => h.uri));
  for (const row of rows) {
    if (scan.hits.length >= scan.limit) break;
    const uri = `/inventory/items/${row.id}`;
    if (seenIds.has(uri)) continue;
    const { score, matchType } = classifyNameMatch(row.itemName.toLowerCase(), scan.lowerText);
    scan.hits.push({ uri, score, matchField: 'itemName', matchType, data: rowToData(row) });
  }
}

function searchItems(db: InventoryDb, text: string): SearchHit[] {
  const scan: SearchScan = { db, lowerText: text.toLowerCase(), limit: DEFAULT_LIMIT, hits: [] };

  searchAssetExact(scan);
  if (scan.hits.length < scan.limit) searchAssetPrefix(scan);
  if (scan.hits.length < scan.limit) searchByName(scan);

  scan.hits.sort((a, b) => b.score - a.score);
  return scan.hits.slice(0, scan.limit);
}

export function makeSearchHandlers(db: InventoryDb) {
  return {
    search: ({ body }: Req['search']) =>
      runHttp(() => {
        const text = body.query.text.trim();
        if (!text) return { status: 200 as const, body: { hits: [] } };
        return { status: 200 as const, body: { hits: searchItems(db, text) } };
      }),
  };
}
