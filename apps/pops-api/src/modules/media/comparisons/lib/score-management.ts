import { and, asc, eq } from 'drizzle-orm';

import { comparisonDimensions, comparisons, mediaScores } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { drawTierOutcome, expectedScore, getEloK } from './elo-calculator.js';

import type { MediaScoreRow, RecordComparisonInput } from '../types.js';

export function getOrCreateScore(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): MediaScoreRow {
  const db = getDrizzle();

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
    .values({
      mediaType,
      mediaId,
      dimensionId,
      score: 1500.0,
      comparisonCount: 0,
    })
    .run();

  const score: MediaScoreRow | undefined = db
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

export function updateEloScores(input: RecordComparisonInput): { deltaA: number; deltaB: number } {
  const db = getDrizzle();

  const scoreA = getOrCreateScore(input.mediaAType, input.mediaAId, input.dimensionId);
  const scoreB = getOrCreateScore(input.mediaBType, input.mediaBId, input.dimensionId);

  const expectedA = expectedScore(scoreA.score, scoreB.score);
  const expectedB = expectedScore(scoreB.score, scoreA.score);

  const isDraw = input.winnerId === 0;
  const drawOutcome = isDraw ? drawTierOutcome(input.drawTier) : 0.5;
  let actualA: number;
  if (isDraw) {
    actualA = drawOutcome;
  } else if (input.winnerType === input.mediaAType && input.winnerId === input.mediaAId) {
    actualA = 1;
  } else {
    actualA = 0;
  }
  const actualB = isDraw ? drawOutcome : 1 - actualA;

  const k = getEloK();
  const newScoreA = scoreA.score + k * (actualA - expectedA);
  const newScoreB = scoreB.score + k * (actualB - expectedB);
  const deltaA = Math.round(newScoreA - scoreA.score);
  const deltaB = Math.round(newScoreB - scoreB.score);
  const now = new Date().toISOString();

  db.update(mediaScores)
    .set({
      score: newScoreA,
      comparisonCount: scoreA.comparisonCount + 1,
      updatedAt: now,
    })
    .where(eq(mediaScores.id, scoreA.id))
    .run();

  db.update(mediaScores)
    .set({
      score: newScoreB,
      comparisonCount: scoreB.comparisonCount + 1,
      updatedAt: now,
    })
    .where(eq(mediaScores.id, scoreB.id))
    .run();

  return { deltaA, deltaB };
}

/**
 * Recalculate ELO scores for a dimension by resetting all scores and replaying
 * all comparisons in chronological order.
 */
export function recalcDimensionElo(dimensionId: number): void {
  const drizzleDb = getDrizzle();

  // Reset all scores for this dimension
  drizzleDb
    .update(mediaScores)
    .set({ score: 1500.0, comparisonCount: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.dimensionId, dimensionId))
    .run();

  // Replay all remaining comparisons in chronological order, updating stored deltas
  const remaining = drizzleDb
    .select()
    .from(comparisons)
    .where(eq(comparisons.dimensionId, dimensionId))
    .orderBy(asc(comparisons.comparedAt))
    .all();

  for (const comp of remaining) {
    const { deltaA, deltaB } = updateEloScores({
      dimensionId: comp.dimensionId,
      mediaAType: comp.mediaAType as 'movie' | 'tv_show',
      mediaAId: comp.mediaAId,
      mediaBType: comp.mediaBType as 'movie' | 'tv_show',
      mediaBId: comp.mediaBId,
      winnerType: comp.winnerType as 'movie' | 'tv_show',
      winnerId: comp.winnerId,
      drawTier: comp.drawTier as 'high' | 'mid' | 'low' | null,
    });

    drizzleDb.update(comparisons).set({ deltaA, deltaB }).where(eq(comparisons.id, comp.id)).run();
  }
}

/**
 * Recalculate ELO scores for all active dimensions.
 * Used after bulk data changes (e.g. dedupe migration).
 */
export function recalcAllDimensions(): number {
  const drizzleDb = getDrizzle();
  const dims = drizzleDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();
  for (const dim of dims) {
    recalcDimensionElo(dim.id);
  }
  return dims.length;
}
