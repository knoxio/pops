/**
 * Cross-table read helper for the nudge subsystem.
 *
 * Loads the active engram summaries that detectors scan over. Stays in
 * pops-api for now — it reads `engram_index` / `engram_scopes` /
 * `engram_tags`, all cerebrum-owned tables that move when the engrams
 * slice migrates into `@pops/cerebrum-db` in a later PR.
 *
 * The nudge_log persistence functions (`persistCandidates`,
 * `listContradictions`, `enforcePendingCap`) used to live here too;
 * they moved to `@pops/cerebrum-db` in Phase 1 PR 1 (#2797) and the
 * NudgeService consumes them from the package directly as of this
 * cutover PR.
 */
import { inArray, sql } from 'drizzle-orm';

import { engramIndex, engramScopes, engramTags } from '@pops/cerebrum-db';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { EngramSummary } from './types.js';

/**
 * Engrams source handle. Today this is the shared pops.db until the
 * engrams slice migrates into `@pops/cerebrum-db`. Widened to
 * `Record<string, unknown>` so the same type works for both the bare
 * pops.db handle (`getDrizzle()`) and the pillar handles
 * (`getCerebrumDrizzle()`) — the runtime is a no-op but TS's invariant
 * default schema parameter forces this dance.
 */
type EngramsDb = BetterSQLite3Database<Record<string, unknown>>;

/** Group rows by engramId into a multi-value map. */
function buildLookup(rows: { engramId: string; val: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.engramId);
    if (arr) arr.push(r.val);
    else map.set(r.engramId, [r.val]);
  }
  return map;
}

/** Load active engrams from the index for detector input. */
export function loadActiveEngrams(db: EngramsDb): EngramSummary[] {
  const rows = db
    .select()
    .from(engramIndex)
    .where(sql`${engramIndex.status} NOT IN ('archived', 'consolidated')`)
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const scopeMap = buildLookup(
    db
      .select({ engramId: engramScopes.engramId, val: engramScopes.scope })
      .from(engramScopes)
      .where(inArray(engramScopes.engramId, ids))
      .all()
  );
  const tagMap = buildLookup(
    db
      .select({ engramId: engramTags.engramId, val: engramTags.tag })
      .from(engramTags)
      .where(inArray(engramTags.engramId, ids))
      .all()
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status,
    scopes: scopeMap.get(r.id) ?? [],
    tags: tagMap.get(r.id) ?? [],
    createdAt: r.createdAt,
    modifiedAt: r.modifiedAt,
  }));
}
