/**
 * Pure mapping from a food-local `ai_inference_log` row to the cross-pillar
 * `@pops/ai-telemetry` `InferenceRecord` consumed by the ai pillar's
 * `POST /ai-usage/record`. Kept side-effect-free in `src/` so the one-shot
 * backfill script (`scripts/backfill-ai-inference.ts`) is a thin DB+HTTP shell
 * over a unit-tested transform.
 *
 * Idempotency: every produced record carries a STABLE
 * `metadata.dedupe_key = 'food:ai_inference_log:<id>'` plus
 * `metadata.backfilled_from = 'food'`, so re-running the backfill yields
 * byte-identical records and a future de-dup pass over the ai pillar's store
 * can collapse duplicates deterministically.
 */
import { InferenceRecordSchema, type InferenceRecord } from '@pops/ai-telemetry';

import type { InferSelectModel } from 'drizzle-orm';

import type { aiInferenceLog } from '../../db/schema/ai-inference-log.js';

export type AiInferenceLogRow = InferSelectModel<typeof aiInferenceLog>;

export const BACKFILL_SOURCE = 'food';
export const DEDUPE_KEY_PREFIX = 'food:ai_inference_log';

/**
 * Food's historical rows recorded `provider='claude'`, but the live
 * `callWithLogging` callers emit `provider='anthropic'`. Normalise the legacy
 * id so observability/budgets/pricing don't split the same system across two
 * providers; the original is preserved in `metadata.legacy_provider`.
 */
const LEGACY_PROVIDER = 'claude';
const NORMALISED_PROVIDER = 'anthropic';

const CONTEXT_ID_MAX = 128;
const NO_WHITESPACE = /^\S+$/;
const ERROR_MESSAGE_MAX = 1000;
const PASSTHROUGH_STATUSES: readonly InferenceRecord['status'][] = [
  'success',
  'error',
  'timeout',
  'budget-blocked',
];

function isInferenceStatus(status: string): status is InferenceRecord['status'] {
  return PASSTHROUGH_STATUSES.some((known) => known === status);
}

/** Deterministic dedupe key for a food inference row. */
export function backfillDedupeKey(rowId: number): string {
  return `${DEDUPE_KEY_PREFIX}:${rowId}`;
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (raw == null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Only forward a contextId the ai ingest schema will accept (opaque, no whitespace). */
function safeContextId(contextId: string | null): string | undefined {
  if (contextId == null || contextId === '') return undefined;
  if (contextId.length > CONTEXT_ID_MAX) return undefined;
  return NO_WHITESPACE.test(contextId) ? contextId : undefined;
}

function normaliseStatus(status: string): InferenceRecord['status'] {
  return isInferenceStatus(status) ? status : 'success';
}

/**
 * Maps one food `ai_inference_log` row to a validated {@link InferenceRecord}.
 * Throws via `InferenceRecordSchema.parse` if the row is structurally
 * unmappable (the backfill skips such rows rather than abort the whole run).
 */
export function foodRowToInferenceRecord(row: AiInferenceLogRow): InferenceRecord {
  const existing = parseMetadata(row.metadata);
  const provider = row.provider === LEGACY_PROVIDER ? NORMALISED_PROVIDER : row.provider;
  const metadata: Record<string, unknown> = {
    ...existing,
    backfilled_from: BACKFILL_SOURCE,
    dedupe_key: backfillDedupeKey(row.id),
    ...(provider !== row.provider ? { legacy_provider: row.provider } : {}),
  };
  const contextId = safeContextId(row.contextId);
  const errorMessage =
    row.errorMessage == null ? undefined : row.errorMessage.slice(0, ERROR_MESSAGE_MAX);

  return InferenceRecordSchema.parse({
    provider,
    model: row.model,
    operation: row.operation,
    domain: BACKFILL_SOURCE,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    status: normaliseStatus(row.status),
    cached: row.cached === 1,
    ...(contextId !== undefined ? { contextId } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    metadata,
  });
}
