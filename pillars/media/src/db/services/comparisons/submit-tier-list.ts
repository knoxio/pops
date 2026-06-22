/**
 * Submit a tier list — convert placements into pairwise comparisons + persist
 * tier overrides, atomically. HTTP-free, `(db, …)` arg.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { mediaScores } from '../../schema.js';
import { batchRecordComparisons } from './batch-record.js';
import { getDefaultScore } from './config.js';
import { convertTierPlacements } from './tier-conversion.js';
import { setTierOverride } from './tier-overrides.js';

import type { MediaDb } from '../internal.js';
import type {
  BatchComparisonItem,
  ScoreChange,
  SubmitTierListInput,
  SubmitTierListResult,
} from './mappers.js';

function fetchScoresMap(db: MediaDb, movieIds: number[], dimensionId: number): Map<number, number> {
  const map = new Map<number, number>();
  if (movieIds.length === 0) return map;
  const rows = db
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

function captureScores(db: MediaDb, input: SubmitTierListInput): Map<number, number> {
  const ids = input.placements.map((p) => p.movieId);
  const map = fetchScoresMap(db, ids, input.dimensionId);
  for (const id of ids) if (!map.has(id)) map.set(id, getDefaultScore(db));
  return map;
}

function buildBatchItems(input: SubmitTierListInput): BatchComparisonItem[] {
  return convertTierPlacements(input.placements).map((pair) => ({
    mediaAType: 'movie',
    mediaAId: pair.mediaAId,
    mediaBType: 'movie',
    mediaBId: pair.mediaBId,
    winnerType: 'movie',
    winnerId: pair.winnerId,
    drawTier: pair.drawTier,
  }));
}

function collectScoreChanges(
  db: MediaDb,
  input: SubmitTierListInput,
  oldScores: Map<number, number>
): ScoreChange[] {
  const ids = input.placements.map((p) => p.movieId);
  const newScores = fetchScoresMap(db, ids, input.dimensionId);
  return input.placements.map((placement) => ({
    movieId: placement.movieId,
    oldScore: oldScores.get(placement.movieId) ?? getDefaultScore(db),
    newScore: newScores.get(placement.movieId) ?? getDefaultScore(db),
  }));
}

/**
 * Submit a tier list: each pair of placed movies becomes a comparison (the
 * higher-tier movie wins; same-tier is a tier-mapped draw), recorded as a
 * `tier_list`-sourced batch, and a tier override is persisted per placement.
 * Returns the comparison count, skips, and per-movie score deltas.
 */
export function submitTierList(db: MediaDb, input: SubmitTierListInput): SubmitTierListResult {
  const oldScores = captureScores(db, input);
  const batchItems = buildBatchItems(input);

  const { count: comparisonsRecorded, skipped } = batchRecordComparisons(
    db,
    input.dimensionId,
    batchItems,
    'tier_list'
  );

  db.transaction((tx) => {
    for (const placement of input.placements) {
      setTierOverride(tx, {
        mediaType: 'movie',
        mediaId: placement.movieId,
        dimensionId: input.dimensionId,
        tier: placement.tier,
      });
    }
  });

  const scoreChanges = collectScoreChanges(db, input, oldScores);
  return { comparisonsRecorded, skipped, scoreChanges };
}
