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
    const db = getDrizzle();
    const lowerText = text.toLowerCase();
    const hits: SearchHit<InventoryItemHitData>[] = [];

    // 1. Asset ID exact match (score 1.0)
    const exactAssetRows = db
      .select()
      .from(homeInventory)
      .where(sql`lower(${homeInventory.assetId}) = ${lowerText}`)
      .all();

    for (const row of exactAssetRows) {
      hits.push({
        uri: `/inventory/items/${row.id}`,
        score: 1.0,
        matchField: 'assetId',
        matchType: 'exact',
        data: {
          itemName: row.itemName,
          assetId: row.assetId,
          location: row.location,
          type: row.type,
          condition: row.condition,
        },
      });
    }

    // 2. Asset ID prefix match (score 0.9)
    if (hits.length < limit) {
      const prefixAssetRows = db
        .select()
        .from(homeInventory)
        .where(
          sql`lower(${homeInventory.assetId}) like ${lowerText + '%'} and lower(${homeInventory.assetId}) != ${lowerText}`
        )
        .all();

      for (const row of prefixAssetRows) {
        if (hits.length >= limit) break;
        hits.push({
          uri: `/inventory/items/${row.id}`,
          score: 0.9,
          matchField: 'assetId',
          matchType: 'prefix',
          data: {
            itemName: row.itemName,
            assetId: row.assetId,
            location: row.location,
            type: row.type,
            condition: row.condition,
          },
        });
      }
    }

    // Track IDs already in hits to avoid duplicates from name search
    const seenIds = new Set(hits.map((h) => h.uri));

    // 3. Name search — exact, prefix, contains
    if (hits.length < limit) {
      const nameRows = db
        .select()
        .from(homeInventory)
        .where(sql`lower(${homeInventory.itemName}) like ${'%' + lowerText + '%'}`)
        .all();

      for (const row of nameRows) {
        if (hits.length >= limit) break;
        const uri = `/inventory/items/${row.id}`;
        if (seenIds.has(uri)) continue;

        const lowerName = row.itemName.toLowerCase();
        let score: number;
        let matchType: 'exact' | 'prefix' | 'contains';

        if (lowerName === lowerText) {
          score = 0.85;
          matchType = 'exact';
        } else if (lowerName.startsWith(lowerText)) {
          score = 0.7;
          matchType = 'prefix';
        } else {
          score = 0.5;
          matchType = 'contains';
        }

        hits.push({
          uri,
          score,
          matchField: 'itemName',
          matchType,
          data: {
            itemName: row.itemName,
            assetId: row.assetId,
            location: row.location,
            type: row.type,
            condition: row.condition,
          },
        });
      }
    }

    // Sort by score descending
    hits.sort((a, b) => b.score - a.score);

    return hits.slice(0, limit);
  },
};

registerSearchAdapter(inventoryItemsSearchAdapter);
