import { like } from 'drizzle-orm';

import { entities } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../search/registry.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../search/types.js';

export interface EntityHitData {
  name: string;
  type: string;
  aliases: string[];
}

function scoreAndClassify(
  name: string,
  queryText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } | null {
  const lower = name.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

function parseAliases(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const entitiesSearchAdapter: SearchAdapter<EntityHitData> = {
  domain: 'entities',
  icon: 'Building2',
  color: 'green',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<EntityHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const rows = db
      .select()
      .from(entities)
      .where(like(entities.name, `%${text}%`))
      .all();

    const limit = options?.limit ?? 20;
    const hits: SearchHit<EntityHitData>[] = [];

    for (const row of rows) {
      const match = scoreAndClassify(row.name, text);
      if (!match) continue;

      hits.push({
        uri: `pops:finance/entity/${row.id}`,
        score: match.score,
        matchField: 'name',
        matchType: match.matchType,
        data: {
          name: row.name,
          type: row.type,
          aliases: parseAliases(row.aliases),
        },
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  },
};

registerSearchAdapter(entitiesSearchAdapter);
