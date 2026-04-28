import { and, eq, inArray } from 'drizzle-orm';

import { mediaScores } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { getSettingValue } from '../../../core/settings/service.js';
import { convertTierPlacements } from '../tier-conversion.js';
import { setTierOverride } from '../tier-overrides.js';
import { batchRecordComparisons } from './batch-record.js';

import type {
  BatchComparisonItem,
  ScoreChange,
  SubmitTierListInput,
  SubmitTierListResult,
} from '../types.js';

function getDefaultScore(): number {
  return getSettingValue('media.comparisons.defaultScore', 1500);
}

function fetchScoresMap(movieIds: number[], dimensionId: number): Map<number, number> {
  const drizzleDb = getDrizzle();
  const map = new Map<number, number>();
  if (movieIds.length === 0) return map;
  const rows = drizzleDb
    .select({ mediaId: mediaScores.mediaId, score: mediaScores.score })
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, 'movie'),
        eq(mediaScores.dimensionId, dimensionId),
        inArray(mediaScores.mediaId, movieIds)
      )
    )
    .all();
  for (const row of rows) map.set(row.mediaId, row.score);
  return map;
}

function captureOldScores(input: SubmitTierListInput): Map<number, number> {
  const ids = input.placements.map((p) => p.movieId);
  const map = fetchScoresMap(ids, input.dimensionId);
  for (const id of ids) {
    if (!map.has(id)) map.set(id, getDefaultScore());
  }
  return map;
}

function buildBatchItems(input: SubmitTierListInput): BatchComparisonItem[] {
  const pairwise = convertTierPlacements(input.placements);
  return pairwise.map((pair) => ({
    mediaAType: 'movie' as const,
    mediaAId: pair.mediaAId,
    mediaBType: 'movie' as const,
    mediaBId: pair.mediaBId,
    winnerType: 'movie' as const,
    winnerId: pair.winnerId,
    drawTier: pair.drawTier,
  }));
}

function applyOverrides(input: SubmitTierListInput): void {
  const rawDb = getDb();
  rawDb.transaction(() => {
    for (const placement of input.placements) {
      setTierOverride('movie', placement.movieId, input.dimensionId, placement.tier);
    }
  })();
}

function collectScoreChanges(
  input: SubmitTierListInput,
  oldScores: Map<number, number>
): ScoreChange[] {
  const ids = input.placements.map((p) => p.movieId);
  const newScores = fetchScoresMap(ids, input.dimensionId);
  return input.placements.map((placement) => ({
    movieId: placement.movieId,
    oldScore: oldScores.get(placement.movieId) ?? getDefaultScore(),
    newScore: newScores.get(placement.movieId) ?? getDefaultScore(),
  }));
}

/**
 * Submit a tier list: converts tier placements into pairwise comparisons.
 *
 * For each pair of placed movies, the higher-tier movie wins.
 * Movies in the same tier are recorded as a "mid" draw.
 * Also sets tier overrides for each placement.
 *
 * Returns the number of comparisons recorded and score deltas.
 */
export function submitTierList(input: SubmitTierListInput): SubmitTierListResult {
  const oldScores = captureOldScores(input);
  const batchItems = buildBatchItems(input);
  const { count: comparisonsRecorded, skipped } = batchRecordComparisons(
    input.dimensionId,
    batchItems,
    'tier_list'
  );
  applyOverrides(input);
  const scoreChanges = collectScoreChanges(input, oldScores);
  return { comparisonsRecorded, skipped, scoreChanges };
}
