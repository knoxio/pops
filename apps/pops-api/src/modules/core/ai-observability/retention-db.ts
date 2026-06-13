/**
 * Thin adapter between the retention orchestrator's `DailyAggregate` /
 * `RetentionInputRow` shapes and `@pops/core-db`'s `aiUsageService`.
 *
 * Every helper resolves the core pillar handle the caller supplies and
 * delegates the actual SQL into the package. This keeps the rollup
 * routing entirely on `core.db` (PRD-186 PR 3).
 */
import { aiUsageService, type CoreDb } from '@pops/core-db';

import type { DailyAggregate, RetentionInputRow } from './retention-types.js';

export function fetchAgedBatch(
  db: CoreDb,
  cutoffIso: string,
  batchSize: number
): Array<{ id: number; row: RetentionInputRow }> {
  return aiUsageService.fetchAgedInferenceLogs(db, cutoffIso, batchSize);
}

export function upsertAggregate(db: CoreDb, agg: DailyAggregate): void {
  aiUsageService.recordInferenceDaily(db, agg);
}

export function deleteRowsByIds(db: CoreDb, ids: number[]): void {
  aiUsageService.deleteInferenceLogsByIds(db, ids);
}
