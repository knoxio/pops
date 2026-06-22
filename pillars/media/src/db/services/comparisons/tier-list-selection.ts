/**
 * Select up to N movies for a tier-list placement round via greedy maximum
 * coverage of NEW pairwise comparisons. Raw SQL via drizzle's `db.all`.
 */
import { sql } from 'drizzle-orm';

import { normalizePairOrder } from './comparison-queries.js';
import { getMaxTierListMovies, getStalenessThreshold } from './config.js';
import { getDimension } from './dimensions.js';
import { getTierOverrides, type TierOverride } from './tier-overrides.js';

import type { MediaDb } from '../internal.js';
import type { TierListMovie } from './mappers.js';

interface ScoreRow {
  mediaId: number;
  score: number;
  comparisonCount: number;
  title: string;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
}

function moviePosterUrl(override: string | null, tmdbId: number | null): string | null {
  if (override) return override;
  if (tmdbId) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return null;
}

function buildTierOverrideMap(overrides: TierOverride[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const o of overrides) map.set(o.mediaId, o.tier);
  return map;
}

function toTierListMovie(row: ScoreRow, tierOverrideMap: Map<number, string>): TierListMovie {
  return {
    id: row.mediaId,
    title: row.title,
    posterUrl: moviePosterUrl(row.moviePosterOverride, row.movieTmdbId),
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
    tierOverride: tierOverrideMap.get(row.mediaId) ?? null,
  };
}

function fetchEligibleRows(db: MediaDb, dimensionId: number): ScoreRow[] {
  const stalenessThreshold = getStalenessThreshold(db);
  return db.all<ScoreRow>(sql`
    SELECT
      ms.media_id AS mediaId,
      ms.score AS score,
      ms.comparison_count AS comparisonCount,
      m.title AS title,
      m.poster_path AS moviePosterPath,
      m.tmdb_id AS movieTmdbId,
      m.poster_override_path AS moviePosterOverride
    FROM media_scores ms
    JOIN movies m ON ms.media_id = m.id
    LEFT JOIN watch_history wh ON wh.media_type = 'movie' AND wh.media_id = ms.media_id AND wh.blacklisted = 1
    LEFT JOIN comparison_staleness cs ON cs.media_type = 'movie' AND cs.media_id = ms.media_id
    WHERE ms.dimension_id = ${dimensionId}
      AND ms.media_type = 'movie'
      AND ms.excluded = 0
      AND wh.id IS NULL
      AND COALESCE(cs.staleness, 1.0) >= ${stalenessThreshold}
    ORDER BY ms.comparison_count ASC, ms.score DESC
  `);
}

function fetchExistingPairKeys(db: MediaDb, dimensionId: number): Set<string> {
  const pairRows = db.all<{
    media_a_type: string;
    media_a_id: number;
    media_b_type: string;
    media_b_id: number;
  }>(sql`
    SELECT media_a_type, media_a_id, media_b_type, media_b_id
    FROM comparisons WHERE dimension_id = ${dimensionId}
  `);
  const set = new Set<string>();
  for (const p of pairRows) {
    const [nAt, nAi, nBt, nBi] = normalizePairOrder(
      p.media_a_type,
      p.media_a_id,
      p.media_b_type,
      p.media_b_id
    );
    set.add(`${nAt}:${nAi}:${nBt}:${nBi}`);
  }
  return set;
}

function countNewPairs(
  candidate: ScoreRow,
  selected: ScoreRow[],
  existingPairs: Set<string>
): number {
  let newPairs = 0;
  for (const sel of selected) {
    const [nAt, nAi, nBt, nBi] = normalizePairOrder(
      'movie',
      candidate.mediaId,
      'movie',
      sel.mediaId
    );
    if (!existingPairs.has(`${nAt}:${nAi}:${nBt}:${nBi}`)) newPairs++;
  }
  return newPairs;
}

function pickBestCandidate(
  rows: ScoreRow[],
  selected: ScoreRow[],
  selectedIds: Set<number>,
  existingPairs: Set<string>
): number {
  let bestIdx = -1;
  let bestNewPairs = -1;
  let bestCompCount = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const candidate = rows[i];
    if (!candidate || selectedIds.has(candidate.mediaId)) continue;
    const newPairs = countNewPairs(candidate, selected, existingPairs);
    if (
      newPairs > bestNewPairs ||
      (newPairs === bestNewPairs && candidate.comparisonCount < bestCompCount)
    ) {
      bestIdx = i;
      bestNewPairs = newPairs;
      bestCompCount = candidate.comparisonCount;
    }
  }
  return bestIdx;
}

function greedySelect(rows: ScoreRow[], existingPairs: Set<string>, max: number): ScoreRow[] {
  const selected: ScoreRow[] = [];
  const selectedIds = new Set<number>();
  for (let round = 0; round < max && rows.length > 0; round++) {
    const bestIdx = pickBestCandidate(rows, selected, selectedIds, existingPairs);
    if (bestIdx === -1) break;
    const pick = rows[bestIdx];
    if (!pick) break;
    selected.push(pick);
    selectedIds.add(pick.mediaId);
  }
  return selected;
}

/**
 * Select up to N movies for a tier-list round.
 *
 * Greedy maximum coverage: fetch eligible movies (excluding blacklisted,
 * dimension-excluded, and too-stale) and all existing comparison pairs, then
 * greedily pick movies that maximise NEW pairwise comparisons, tie-breaking by
 * lowest comparison count. Includes persisted tier overrides so the client can
 * hydrate placements.
 */
export function getTierListMovies(db: MediaDb, dimensionId: number): TierListMovie[] {
  getDimension(db, dimensionId);
  const rows = fetchEligibleRows(db, dimensionId);
  if (rows.length === 0) return [];

  const tierOverrideMap = buildTierOverrideMap(getTierOverrides(db, dimensionId));

  const maxTierListMovies = getMaxTierListMovies(db);
  if (rows.length <= maxTierListMovies) {
    return rows.map((r) => toTierListMovie(r, tierOverrideMap));
  }
  const existingPairs = fetchExistingPairKeys(db, dimensionId);
  return greedySelect(rows, existingPairs, maxTierListMovies).map((r) =>
    toTierListMovie(r, tierOverrideMap)
  );
}
