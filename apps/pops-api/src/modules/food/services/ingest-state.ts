import type { JobType } from 'bullmq';

/**
 * PRD-125 — `IngestStatus.state` derivation.
 *
 * Combines BullMQ's job state (live for ~`removeOnComplete`/`removeOnFail`
 * count) with the DB row state (authoritative once the job has aged out
 * of Redis). The DB row drives `completed` / `failed` / `partial` after
 * the worker writes back via `workerComplete`.
 */
import type { IngestSourceRow } from '@pops/app-food-db';

export type IngestState = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

const BULLMQ_TO_INGEST: Partial<Record<JobType | string, IngestState>> = {
  waiting: 'pending',
  delayed: 'pending',
  waiting_children: 'pending',
  prioritized: 'pending',
  active: 'processing',
  completed: 'completed',
  failed: 'failed',
};

/**
 * Resolution priority:
 *   1. If the DB row carries `error_code` or `error_message`, the worker
 *      already wrote back failure → `failed` regardless of any stale
 *      BullMQ state.
 *   2. If `draft_recipe_id` is set, the worker wrote back success → use
 *      DB row to choose `completed` vs `partial` (the latter is recorded
 *      by `extracted_json.partialReason`).
 *   3. Otherwise fall back to whatever BullMQ reports.
 *   4. If BullMQ has no record (TTL expired) and DB says nothing terminal,
 *      treat as `pending` so the polling client keeps polling — this
 *      should not happen in normal operation.
 */
export function deriveIngestState(
  row: IngestSourceRow,
  bullmqState: string | null,
  partialReasonInMeta: string | undefined
): IngestState {
  if (row.errorCode !== null || row.errorMessage !== null) return 'failed';
  if (row.draftRecipeId !== null) {
    return partialReasonInMeta === undefined ? 'completed' : 'partial';
  }
  if (bullmqState === null) return 'pending';
  return BULLMQ_TO_INGEST[bullmqState] ?? 'pending';
}

/**
 * Extracted out so `status` and `list` use the same partial-reason lookup.
 * Treats malformed JSON as "no partial reason" rather than throwing.
 */
export function extractPartialReason(extractedJson: string | null): string | undefined {
  if (extractedJson === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(extractedJson);
    if (typeof parsed === 'object' && parsed !== null && 'partialReason' in parsed) {
      const reason = (parsed as { partialReason: unknown }).partialReason;
      return typeof reason === 'string' ? reason : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
