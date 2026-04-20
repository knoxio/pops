import { eq } from 'drizzle-orm';

import { comparisons } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { ValidationError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';
import { findExistingComparison } from './comparison-queries.js';
import { recalcDimensionElo, updateEloScores } from './score-management.js';

import type { BatchComparisonItem, BatchRecordResult, RecordComparisonInput } from '../types.js';

/** Source authority ranking: higher rank = more authoritative. null/historical = 0. */
export function sourceRank(source: string | null | undefined): number {
  switch (source) {
    case 'arena':
      return 2;
    case 'tier_list':
      return 1;
    default:
      return 0;
  }
}

interface BatchState {
  insertedCount: number;
  skippedCount: number;
  hasOverrides: boolean;
}

interface ProcessItemArgs {
  dimensionId: number;
  item: BatchComparisonItem;
  source: string | null | undefined;
  state: BatchState;
}

function insertWithoutDelta(
  dimensionId: number,
  item: BatchComparisonItem,
  source: string | null | undefined
): void {
  const drizzleDb = getDrizzle();
  drizzleDb
    .insert(comparisons)
    .values({
      dimensionId,
      mediaAType: item.mediaAType,
      mediaAId: item.mediaAId,
      mediaBType: item.mediaBType,
      mediaBId: item.mediaBId,
      winnerType: item.winnerType,
      winnerId: item.winnerId,
      drawTier: item.drawTier ?? null,
      source: source ?? null,
    })
    .run();
}

function insertWithDelta(
  dimensionId: number,
  item: BatchComparisonItem,
  source: string | null | undefined
): void {
  const drizzleDb = getDrizzle();
  const comparisonInput: RecordComparisonInput = {
    dimensionId,
    mediaAType: item.mediaAType,
    mediaAId: item.mediaAId,
    mediaBType: item.mediaBType,
    mediaBId: item.mediaBId,
    winnerType: item.winnerType,
    winnerId: item.winnerId,
    drawTier: item.drawTier ?? null,
  };
  const { deltaA, deltaB } = updateEloScores(comparisonInput);
  drizzleDb
    .insert(comparisons)
    .values({
      dimensionId,
      mediaAType: item.mediaAType,
      mediaAId: item.mediaAId,
      mediaBType: item.mediaBType,
      mediaBId: item.mediaBId,
      winnerType: item.winnerType,
      winnerId: item.winnerId,
      drawTier: item.drawTier ?? null,
      source: source ?? null,
      deltaA,
      deltaB,
    })
    .run();
}

function processItem(args: ProcessItemArgs): void {
  const { dimensionId, item, source, state } = args;
  const drizzleDb = getDrizzle();
  const existing = findExistingComparison({
    dimensionId,
    mediaAType: item.mediaAType,
    mediaAId: item.mediaAId,
    mediaBType: item.mediaBType,
    mediaBId: item.mediaBId,
  });

  if (existing) {
    const existingSource = existing.source ?? null;
    const incomingSource = source ?? null;
    if (sourceRank(incomingSource) >= sourceRank(existingSource)) {
      drizzleDb.delete(comparisons).where(eq(comparisons.id, existing.id)).run();
      state.hasOverrides = true;
    } else {
      state.skippedCount++;
      return;
    }
  }

  if (state.hasOverrides) {
    insertWithoutDelta(dimensionId, item, source);
  } else {
    insertWithDelta(dimensionId, item, source);
  }
  state.insertedCount++;
}

/**
 * Record multiple comparisons in a single transaction with ELO updates.
 *
 * All-or-nothing: if any comparison fails, the entire batch is rolled back.
 * Each comparison is inserted and its ELO scores are updated within the
 * same transaction. Returns the total count of comparisons recorded.
 */
export function batchRecordComparisons(
  dimensionId: number,
  items: BatchComparisonItem[],
  source?: string | null
): BatchRecordResult {
  const dimension = getDimension(dimensionId);
  if (dimension.active !== 1) {
    throw new ValidationError('Cannot record comparisons for inactive dimension');
  }

  const state: BatchState = { insertedCount: 0, skippedCount: 0, hasOverrides: false };
  const rawDb = getDb();
  rawDb.transaction(() => {
    for (const item of items) {
      processItem({ dimensionId, item, source, state });
    }
    if (state.hasOverrides) {
      recalcDimensionElo(dimensionId);
    }
  })();

  return { count: state.insertedCount, skipped: state.skippedCount };
}
