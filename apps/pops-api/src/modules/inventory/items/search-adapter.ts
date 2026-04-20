import { sql } from 'drizzle-orm';

import { homeInventory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/index.js';

export interface InventoryItemHitData {
  itemName: string;
  assetId: string | null;
  location: string | null;
  type: string | null;
  condition: string | null;
}

const DEFAULT_LIMIT = 20;

type Row = typeof homeInventory.$inferSelect;

function rowToData(row: Row): InventoryItemHitData {
  return {
    itemName: row.itemName,
    assetId: row.assetId,
    location: row.location,
    type: row.type,
    condition: row.condition,
  };
}

function searchAssetExact(lowerText: string, hits: SearchHit<InventoryItemHitData>[]): void {
  const rows = getDrizzle()
    .select()
    .from(homeInventory)
    .where(sql`lower(${homeInventory.assetId}) = ${lowerText}`)
    .all();
  for (const row of rows) {
    hits.push({
      uri: `/inventory/items/${row.id}`,
      score: 1.0,
      matchField: 'assetId',
      matchType: 'exact',
      data: rowToData(row),
    });
  }
}

function searchAssetPrefix(
  lowerText: string,
  limit: number,
  hits: SearchHit<InventoryItemHitData>[]
): void {
  const rows = getDrizzle()
    .select()
    .from(homeInventory)
    .where(
      sql`lower(${homeInventory.assetId}) like ${lowerText + '%'} and lower(${homeInventory.assetId}) != ${lowerText}`
    )
    .all();
  for (const row of rows) {
    if (hits.length >= limit) break;
    hits.push({
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

function searchByName(
  lowerText: string,
  limit: number,
  seenIds: Set<string>,
  hits: SearchHit<InventoryItemHitData>[]
): void {
  const rows = getDrizzle()
    .select()
    .from(homeInventory)
    .where(sql`lower(${homeInventory.itemName}) like ${'%' + lowerText + '%'}`)
    .all();

  for (const row of rows) {
    if (hits.length >= limit) break;
    const uri = `/inventory/items/${row.id}`;
    if (seenIds.has(uri)) continue;
    const { score, matchType } = classifyNameMatch(row.itemName.toLowerCase(), lowerText);
    hits.push({ uri, score, matchField: 'itemName', matchType, data: rowToData(row) });
  }
}

export const inventoryItemsSearchAdapter: SearchAdapter<InventoryItemHitData> = {
  domain: 'inventory-items',
  icon: 'Box',
  color: 'amber',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<InventoryItemHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const lowerText = text.toLowerCase();
    const hits: SearchHit<InventoryItemHitData>[] = [];

    searchAssetExact(lowerText, hits);
    if (hits.length < limit) searchAssetPrefix(lowerText, limit, hits);

    if (hits.length < limit) {
      const seenIds = new Set(hits.map((h) => h.uri));
      searchByName(lowerText, limit, seenIds, hits);
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  },
};

registerSearchAdapter(inventoryItemsSearchAdapter);
