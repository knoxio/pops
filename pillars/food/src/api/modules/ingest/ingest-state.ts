import type { JobType } from 'bullmq';

import type { PartialReason } from '../../../contract/queue/index.js';
/**
 * `IngestStatus.state` derivation.
 *
 * Combines BullMQ's job state (live for ~`removeOnComplete`/`removeOnFail`
 * count) with the DB row state (authoritative once the job has aged out
 * of Redis). The DB row drives `completed` / `failed` / `partial` after
 * the worker writes back via `workerComplete`.
 */
import type { IngestSourceRow } from '../../../db/index.js';

function isPartialReason(value: string): value is PartialReason {
  switch (value) {
    case 'auth-dead':
    case 'rate-limited':
    case 'stt-failed':
    case 'vision-failed':
    case 'caption-only-fallback':
    case 'empty-extraction':
      return true;
    default:
      return false;
  }
}

export type IngestState = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

const BULLMQ_TO_INGEST: Partial<Record<JobType | string, IngestState>> = {
  waiting: 'pending',
  delayed: 'pending',
  'waiting-children': 'pending',
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
export function extractPartialReason(extractedJson: string | null): PartialReason | undefined {
  if (extractedJson === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractedJson);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || !('partialReason' in parsed)) {
    return undefined;
  }
  const reason: unknown = parsed.partialReason;
  if (typeof reason !== 'string') return undefined;
  return isPartialReason(reason) ? reason : undefined;
}
