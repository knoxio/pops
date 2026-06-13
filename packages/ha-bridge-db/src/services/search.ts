/**
 * FTS5-backed search over `ha_entities` (PRD-229 US-02).
 *
 * The HA bridge owns the `ha_entities_fts` virtual table populated by
 * the 0001_ha_entities_fts triggers. Reads run a MATCH query against the
 * FTS table and join back to `ha_entities` for the materialised row. The
 * raw FTS `bm25` rank is composed with a small boost when the query
 * tokens line up with the entity's `area` or `device_class` columns —
 * PRD-229 § Business Rules requires "kitchen temperature" to rank a
 * `sensor.kitchen_temperature` (area=kitchen, device_class=temperature)
 * row above pure friendly-name matches.
 *
 * Ranking convention. `bm25()` returns lower-is-better; this module
 * flips that to a higher-is-better `score` in `[0, 1]` so the caller can
 * forward it to the federation orchestrator (PRD-198 normalises per
 * pillar — exact range doesn't matter as long as ordering is preserved).
 */
import { sql } from 'drizzle-orm';

import type { HaBridgeDb } from './internal.js';

const AREA_BOOST = 0.25;
const DEVICE_CLASS_BOOST = 0.25;
const DEFAULT_LIMIT = 25;
const SNIPPET_MAX_TOKENS = 8;

/**
 * One search hit. `score` is higher-is-better in `[0, 1+boosts]`;
 * `snippet` is the FTS5 `snippet()` output over `friendly_name` (the
 * column humans recognise first).
 */
export interface HaEntitySearchHit {
  entityId: string;
  domain: string;
  friendlyName: string | null;
  area: string | null;
  deviceClass: string | null;
  state: string;
  score: number;
  snippet: string;
}

export interface HaEntitySearchOptions {
  limit?: number;
}

/**
 * Tokenise the user's query into the lowercase word list used to
 * compute area / device_class boosts. The FTS5 MATCH expression itself
 * uses the same tokens joined with `OR`, so unmatched-by-anything
 * queries return `[]` cleanly.
 */
function tokeniseQuery(raw: string): string[] {
  const stripped = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0);
  return Array.from(new Set(tokens));
}

function buildMatchExpression(tokens: readonly string[]): string {
  return tokens.map((t) => `"${t}"`).join(' OR ');
}

interface RawHit {
  entity_id: string;
  domain: string;
  friendly_name: string | null;
  area: string | null;
  device_class: string | null;
  state: string;
  rank: number;
  snippet: string;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRawHit(value: unknown): value is RawHit {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r['entity_id'] !== 'string') return false;
  if (typeof r['domain'] !== 'string') return false;
  if (typeof r['state'] !== 'string') return false;
  if (typeof r['rank'] !== 'number') return false;
  if (typeof r['snippet'] !== 'string') return false;
  if (!isStringOrNull(r['friendly_name'])) return false;
  if (!isStringOrNull(r['area'])) return false;
  return isStringOrNull(r['device_class']);
}

function normaliseBm25(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  const positive = -rank;
  if (positive <= 0) return 0;
  return positive / (positive + 1);
}

function applyBoosts(
  base: number,
  tokens: readonly string[],
  area: string | null,
  deviceClass: string | null
): number {
  if (tokens.length === 0) return base;
  const areaLower = area?.toLowerCase() ?? '';
  const classLower = deviceClass?.toLowerCase() ?? '';
  const hasArea = areaLower.length > 0 && tokens.some((t) => t === areaLower);
  const hasClass = classLower.length > 0 && tokens.some((t) => t === classLower);
  let boosted = base;
  if (hasArea) boosted += AREA_BOOST;
  if (hasClass) boosted += DEVICE_CLASS_BOOST;
  return boosted;
}

/**
 * Search the FTS index. Empty or whitespace-only queries short-circuit
 * to `[]` per PRD-229's "cold boot / empty index" edge case — the
 * adapter must never throw when there's nothing to match.
 */
export function searchEntities(
  db: HaBridgeDb,
  query: string,
  options: HaEntitySearchOptions = {}
): HaEntitySearchHit[] {
  const tokens = tokeniseQuery(query);
  if (tokens.length === 0) return [];

  const limit = options.limit !== undefined && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const match = buildMatchExpression(tokens);

  const raw = db.all<unknown>(
    sql`
      SELECT
        e.entity_id    AS entity_id,
        e.domain       AS domain,
        e.friendly_name AS friendly_name,
        e.area         AS area,
        e.device_class AS device_class,
        e.state        AS state,
        bm25(ha_entities_fts) AS rank,
        snippet(ha_entities_fts, 1, '[', ']', '…', ${SNIPPET_MAX_TOKENS}) AS snippet
      FROM ha_entities_fts
      JOIN ha_entities e ON e.entity_id = ha_entities_fts.entity_id
      WHERE ha_entities_fts MATCH ${match}
      ORDER BY rank
      LIMIT ${limit}
    `
  );
  const rows = raw.filter(isRawHit);

  const hits = rows.map((row): HaEntitySearchHit => {
    const base = normaliseBm25(row.rank);
    const score = applyBoosts(base, tokens, row.area, row.device_class);
    return {
      entityId: row.entity_id,
      domain: row.domain,
      friendlyName: row.friendly_name,
      area: row.area,
      deviceClass: row.device_class,
      state: row.state,
      score,
      snippet: row.snippet,
    };
  });

  hits.sort((a, b) => b.score - a.score);
  return hits;
}
