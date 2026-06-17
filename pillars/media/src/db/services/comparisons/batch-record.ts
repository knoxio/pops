/**
 * Batch comparison recording — record many comparisons in one transaction.
 * HTTP-free, `(db, …)` arg.
 */
import { eq } from 'drizzle-orm';

import { comparisons } from '../../schema.js';
import { findExistingComparison } from './comparison-queries.js';
import { getDimension } from './dimensions.js';
import { InactiveDimensionError } from './errors.js';
import { recalcDimensionElo, updateEloScores } from './score-management.js';

import type { MediaDb } from '../internal.js';
import type { BatchComparisonItem, BatchRecordResult } from './mappers.js';

/** Source authority ranking: higher = more authoritative. null/historical = 0. */
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
  db: MediaDb;
  dimensionId: number;
  item: BatchComparisonItem;
  source: string | null | undefined;
  state: BatchState;
}

function insertWithoutDelta(
  db: MediaDb,
  dimensionId: number,
  item: BatchComparisonItem,
  source: string | null | undefined
): void {
  db.insert(comparisons)
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
  db: MediaDb,
  dimensionId: number,
  item: BatchComparisonItem,
  source: string | null | undefined
): void {
  const { deltaA, deltaB } = updateEloScores(db, { dimensionId, ...item });
  db.insert(comparisons)
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
  const { db, dimensionId, item, source, state } = args;
  const existing = findExistingComparison(db, { dimensionId, ...item });

  if (existing) {
    if (sourceRank(source ?? null) >= sourceRank(existing.source ?? null)) {
      db.delete(comparisons).where(eq(comparisons.id, existing.id)).run();
      state.hasOverrides = true;
    } else {
      state.skippedCount++;
      return;
    }
  }

  if (state.hasOverrides) {
    insertWithoutDelta(db, dimensionId, item, source);
  } else {
    insertWithDelta(db, dimensionId, item, source);
  }
  state.insertedCount++;
}

/**
 * Record multiple comparisons in a single transaction with ELO updates.
 *
 * All-or-nothing: if any comparison fails, the whole batch rolls back. While
 * no override has been seen, each insert applies an incremental ELO update;
 * once an existing comparison is overridden, subsequent inserts skip the
 * incremental update and a single dimension-wide replay reconciles all scores.
 */
export function batchRecordComparisons(
  db: MediaDb,
  dimensionId: number,
  items: BatchComparisonItem[],
  source?: string | null
): BatchRecordResult {
  const dimension = getDimension(db, dimensionId);
  if (dimension.active !== 1) {
    throw new InactiveDimensionError('Cannot record comparisons for inactive dimension');
  }

  const state: BatchState = { insertedCount: 0, skippedCount: 0, hasOverrides: false };
  db.transaction((tx) => {
    for (const item of items) {
      processItem({ db: tx, dimensionId, item, source, state });
    }
    if (state.hasOverrides) recalcDimensionElo(tx, dimensionId);
  });

  return { count: state.insertedCount, skipped: state.skippedCount };
}
