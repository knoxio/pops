import { getDb } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
import { getTierOverrides } from '../tier-overrides.js';
import { normalizePairOrder } from './comparison-queries.js';

import type { TierOverride } from '../tier-overrides.js';
import type { TierListMovie } from '../types.js';

const MAX_TIER_LIST_MOVIES = 8;
const STALENESS_THRESHOLD = 0.3;

interface ScoreRow {
  mediaId: number;
  score: number;
  comparisonCount: number;
  title: string;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
}

function getMoviePosterUrl(override: string | null, tmdbId: number | null): string | null {
  if (override) return override;
  if (tmdbId) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return null;
}

/** Build a map of mediaId → tier from tier overrides for fast lookup. */
function buildTierOverrideMap(overrides: TierOverride[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const o of overrides) {
    map.set(o.mediaId, o.tier);
  }
  return map;
}

function toTierListMovie(row: ScoreRow, tierOverrideMap: Map<number, string>): TierListMovie {
  return {
    id: row.mediaId,
    title: row.title,
    posterUrl: getMoviePosterUrl(row.moviePosterOverride, row.movieTmdbId),
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
    tierOverride: tierOverrideMap.get(row.mediaId) ?? null,
  };
}

function fetchEligibleRows(dimensionId: number): ScoreRow[] {
  const rawDb = getDb();
  return rawDb
    .prepare(
      `SELECT
        ms.media_id as mediaId,
        ms.score as score,
        ms.comparison_count as comparisonCount,
        m.title as title,
        m.poster_path as moviePosterPath,
        m.tmdb_id as movieTmdbId,
        m.poster_override_path as moviePosterOverride
      FROM media_scores ms
      JOIN movies m ON ms.media_id = m.id
      LEFT JOIN watch_history wh ON wh.media_type = 'movie' AND wh.media_id = ms.media_id AND wh.blacklisted = 1
      LEFT JOIN comparison_staleness cs ON cs.media_type = 'movie' AND cs.media_id = ms.media_id
      WHERE ms.dimension_id = ?
        AND ms.media_type = 'movie'
        AND ms.excluded = 0
        AND wh.id IS NULL
        AND COALESCE(cs.staleness, 1.0) >= ?
      ORDER BY ms.comparison_count ASC, ms.score DESC`
    )
    .all(dimensionId, STALENESS_THRESHOLD) as ScoreRow[];
}

function fetchExistingPairKeys(dimensionId: number): Set<string> {
  const rawDb = getDb();
  const pairRows = rawDb
    .prepare(
      `SELECT media_a_type, media_a_id, media_b_type, media_b_id
       FROM comparisons
       WHERE dimension_id = ?`
    )
    .all(dimensionId) as Array<{
    media_a_type: string;
    media_a_id: number;
    media_b_type: string;
    media_b_id: number;
  }>;
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
    if (!existingPairs.has(`${nAt}:${nAi}:${nBt}:${nBi}`)) {
      newPairs++;
    }
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

function greedySelect(rows: ScoreRow[], existingPairs: Set<string>): ScoreRow[] {
  const selected: ScoreRow[] = [];
  const selectedIds = new Set<number>();
  for (let round = 0; round < MAX_TIER_LIST_MOVIES && rows.length > 0; round++) {
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
 * Select up to 8 movies for a tier list placement round.
 *
 * Strategy — greedy maximum coverage:
 *  1. Fetch all eligible movies and all existing comparison pairs
 *  2. Greedily pick movies that maximize NEW pairwise comparisons
 *  3. Tie-break by lowest comparison count (highest uncertainty)
 *  - Exclude: blacklisted, excluded-for-dimension, staleness < 0.3
 *  - Returns fewer than 8 if not enough eligible (min 0)
 *  - Includes persisted tier overrides so the client can hydrate placements.
 */
export function getTierListMovies(dimensionId: number): TierListMovie[] {
  getDimension(dimensionId);
  const rows = fetchEligibleRows(dimensionId);
  if (rows.length === 0) return [];

  const overrides = getTierOverrides(dimensionId);
  const tierOverrideMap = buildTierOverrideMap(overrides);

  if (rows.length <= MAX_TIER_LIST_MOVIES) {
    return rows.map((r) => toTierListMovie(r, tierOverrideMap));
  }
  const existingPairs = fetchExistingPairKeys(dimensionId);
  return greedySelect(rows, existingPairs).map((r) => toTierListMovie(r, tierOverrideMap));
}
