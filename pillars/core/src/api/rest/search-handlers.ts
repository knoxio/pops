/**
 * Handler for the `search.*` sub-router — core's slice of unified search.
 *
 * Ported from `apps/pops-api/src/modules/core/entities/search-adapter.ts`.
 * The monolith adapter read the shared finance handle (`getFinanceDrizzle()`)
 * because `entities` then lived under finance's SQLite file; here it runs
 * against the core pillar's OWN handle (`CoreDb`) where `entities` now lives.
 * The ranking is preserved verbatim: a `LIKE %text%` candidate scan, then a
 * per-row classification into exact (1.0) / prefix (0.8) / contains (0.5),
 * sorted by descending score and capped at the limit.
 *
 * `uri` keeps the `pops:finance/entity/<id>` shape the monolith emitted so the
 * orchestrator's URI dispatch and any cached client links stay stable — the
 * scheme names the logical resource, not the physical pillar handle.
 */
import { like } from 'drizzle-orm';

import { type CoreDb, entities } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreSearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof coreSearchContract>;

const DEFAULT_LIMIT = 20;

interface EntityHitData extends Record<string, unknown> {
  name: string;
  type: string;
  aliases: string[];
}

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: 'exact' | 'prefix' | 'contains';
  data: EntityHitData;
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

function searchEntities(db: CoreDb, text: string): SearchHit[] {
  const rows = db
    .select()
    .from(entities)
    .where(like(entities.name, `%${text}%`))
    .all();

  const hits: SearchHit[] = [];
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
  return hits.slice(0, DEFAULT_LIMIT);
}

export function makeSearchHandlers(db: CoreDb) {
  return {
    search: ({ body }: Req['search']) =>
      runHttp(() => {
        const text = body.query.text.trim();
        if (!text) return { status: 200 as const, body: { hits: [] } };
        return { status: 200 as const, body: { hits: searchEntities(db, text) } };
      }),
  };
}
