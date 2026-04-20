import { and, eq } from 'drizzle-orm';

import { mediaScores } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { convertTierPlacements } from '../tier-conversion.js';
import { setTierOverride } from '../tier-overrides.js';
import { batchRecordComparisons } from './batch-record.js';

import type {
  BatchComparisonItem,
  ScoreChange,
  SubmitTierListInput,
  SubmitTierListResult,
} from '../types.js';

const DEFAULT_SCORE = 1500.0;

function captureOldScores(input: SubmitTierListInput): Map<number, number> {
  const drizzleDb = getDrizzle();
  const oldScores = new Map<number, number>();
  for (const placement of input.placements) {
    const existing = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, 'movie'),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();
    oldScores.set(placement.movieId, existing?.score ?? DEFAULT_SCORE);
  }
  return oldScores;
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
  const drizzleDb = getDrizzle();
  const scoreChanges: ScoreChange[] = [];
  for (const placement of input.placements) {
    const newRow = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, 'movie'),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();
    scoreChanges.push({
      movieId: placement.movieId,
      oldScore: oldScores.get(placement.movieId) ?? DEFAULT_SCORE,
      newScore: newRow?.score ?? DEFAULT_SCORE,
    });
  }
  return scoreChanges;
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
