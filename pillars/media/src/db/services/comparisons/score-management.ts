/**
 * ELO score management — get-or-create scores, apply per-comparison updates,
 * and replay-recalculate a whole dimension. HTTP-free, `(db, …)` arg.
 */
import { and, asc, eq } from 'drizzle-orm';

import { comparisonDimensions, comparisons, mediaScores } from '../../schema.js';
import { getDefaultScore, getEloK } from './config.js';
import { drawTierOutcome, expectedScore } from './elo-calculator.js';

import type { MediaScoreRow } from '../../row-types.js';
import type { MediaDb } from '../internal.js';

/**
 * The fields ELO needs from a comparison. The `*Type` fields are plain
 * strings — they are only string-compared against each other and handed to
 * `getOrCreateScore`, so the narrow `MediaType` union the public API carries
 * is unnecessary here (and avoids downcasting the `text`-typed comparison row).
 */
export interface EloComparisonInput {
  dimensionId: number;
  mediaAType: string;
  mediaAId: number;
  mediaBType: string;
  mediaBId: number;
  winnerType: string;
  winnerId: number;
  drawTier?: string | null;
}

/** Fetch the score row for a media item on a dimension, creating it at baseline if absent. */
export function getOrCreateScore(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId: number
): MediaScoreRow {
  const existing = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();
  if (existing) return existing;

  db.insert(mediaScores)
    .values({ mediaType, mediaId, dimensionId, score: getDefaultScore(db), comparisonCount: 0 })
    .run();

  const score = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();
  if (!score) throw new Error(`Score not found for ${mediaType}:${mediaId}:${dimensionId}`);
  return score;
}

function actualScoreA(input: EloComparisonInput, isDraw: boolean, drawOutcome: number): number {
  if (isDraw) return drawOutcome;
  if (input.winnerType === input.mediaAType && input.winnerId === input.mediaAId) return 1;
  return 0;
}

/** Apply an ELO update for both media of a comparison. Returns the rounded deltas. */
export function updateEloScores(
  db: MediaDb,
  input: EloComparisonInput
): { deltaA: number; deltaB: number } {
  const scoreA = getOrCreateScore(db, input.mediaAType, input.mediaAId, input.dimensionId);
  const scoreB = getOrCreateScore(db, input.mediaBType, input.mediaBId, input.dimensionId);

  const expectedA = expectedScore(scoreA.score, scoreB.score);
  const expectedB = expectedScore(scoreB.score, scoreA.score);

  const isDraw = input.winnerId === 0;
  const drawOutcome = isDraw ? drawTierOutcome(input.drawTier) : 0.5;
  const actualA = actualScoreA(input, isDraw, drawOutcome);
  const actualB = isDraw ? drawOutcome : 1 - actualA;

  const k = getEloK(db);
  const newScoreA = scoreA.score + k * (actualA - expectedA);
  const newScoreB = scoreB.score + k * (actualB - expectedB);
  const deltaA = Math.round(newScoreA - scoreA.score);
  const deltaB = Math.round(newScoreB - scoreB.score);
  const now = new Date().toISOString();

  db.update(mediaScores)
    .set({ score: newScoreA, comparisonCount: scoreA.comparisonCount + 1, updatedAt: now })
    .where(eq(mediaScores.id, scoreA.id))
    .run();

  db.update(mediaScores)
    .set({ score: newScoreB, comparisonCount: scoreB.comparisonCount + 1, updatedAt: now })
    .where(eq(mediaScores.id, scoreB.id))
    .run();

  return { deltaA, deltaB };
}

/**
 * Reset a dimension's scores to baseline and replay every comparison in
 * chronological order, rewriting each comparison's recorded deltas.
 */
export function recalcDimensionElo(db: MediaDb, dimensionId: number): void {
  db.update(mediaScores)
    .set({ score: getDefaultScore(db), comparisonCount: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.dimensionId, dimensionId))
    .run();

  const remaining = db
    .select()
    .from(comparisons)
    .where(eq(comparisons.dimensionId, dimensionId))
    .orderBy(asc(comparisons.comparedAt))
    .all();

  for (const comp of remaining) {
    const { deltaA, deltaB } = updateEloScores(db, {
      dimensionId: comp.dimensionId,
      mediaAType: comp.mediaAType,
      mediaAId: comp.mediaAId,
      mediaBType: comp.mediaBType,
      mediaBId: comp.mediaBId,
      winnerType: comp.winnerType,
      winnerId: comp.winnerId,
      drawTier: comp.drawTier,
    });
    db.update(comparisons).set({ deltaA, deltaB }).where(eq(comparisons.id, comp.id)).run();
  }
}

/** Replay-recalculate every active dimension. Returns the count recalculated. */
export function recalcAllDimensions(db: MediaDb): number {
  const dims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();
  for (const dim of dims) recalcDimensionElo(db, dim.id);
  return dims.length;
}
