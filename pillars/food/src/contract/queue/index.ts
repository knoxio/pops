/**
 * PRD-125 — BullMQ contract for the `food.ingest` queue.
 *
 * Defines:
 *   - The job-data discriminated union the producer (`food.ingest.start`)
 *     enqueues and the consumer (pops-worker-food, PRD-126) reads.
 *   - The job-result discriminated union the worker returns via
 *     `food.ingest.workerComplete`.
 *   - `IngestMeta` — the per-source observability rollup persisted to
 *     `ingest_sources.extracted_json`. PRD-127–132 each populate the
 *     stages they ran; this file owns the shared envelope only.
 *   - `PartialReason` — the closed enum of "produced a draft but with
 *     caveats" outcomes.
 *
 * The contract is pure types + a queue-name constant; no runtime deps.
 * Producer + consumer live in different packages (and in PRD-126 a
 * different container), so this file is the only seam where they can
 * agree on the shape.
 */

/** Closed enum: PRDs 127–132 emit one of these on a successful-with-caveats run. */
export type PartialReason =
  | 'auth-dead' // PRD-129: IG cookies expired.
  | 'rate-limited' // PRD-129: yt-dlp rate-limited; delayed retry.
  | 'stt-failed' // PRD-130: faster-whisper failed; caption + vision used instead.
  | 'vision-failed' // PRD-130: vision call failed; text-LLM fallback used.
  | 'caption-only-fallback' // PRD-130: STT + vision both failed.
  | 'empty-extraction'; // PRD-128 / 130 / 131 / 132: LLM produced 0 ingredients or 0 steps.

/** Closed enum: which extractor produced the job. Matches `ingest_sources.kind`. */
export type IngestKind = 'url-web' | 'url-instagram' | 'text' | 'screenshot';

/**
 * Job data lives in Redis until the worker drains it. Screenshot payloads
 * are NOT inlined (large binaries don't belong in Redis); the API writes
 * the base64 payload to `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>`
 * before enqueue and the job carries only `contentPath`.
 */
export type IngestJobData =
  | { kind: 'url-web'; sourceId: number; url: string }
  | { kind: 'url-instagram'; sourceId: number; url: string }
  | { kind: 'text'; sourceId: number; body: string }
  | { kind: 'screenshot'; sourceId: number; mimeType: string; contentPath: string };

/**
 * Per-source observability rollup persisted on completion. Each handler
 * PRD owns the stages it writes; this file documents the envelope.
 * Stages whose handler skipped them set `skipped: true` and a `reason`.
 */
export interface IngestMeta {
  /** Semicolon-delimited tool versions; see PRD-125 example. */
  extractor_version: string;
  /**
   * Per-stage records keyed by stage name. Stage names are owned per
   * handler PRD (127–132). The value is typed `unknown` so the producer
   * doesn't have to validate handler-specific stage payloads — consumers
   * narrow via `IngestStageRecord` where they care about the shared
   * `ok` / `skipped` / `reason` header.
   */
  stages: Record<string, unknown>;
  total_duration_ms?: number;
  total_cost_usd?: number;
  /** The LLM's raw structured output before draft insertion (when an LLM was used). */
  llm_raw_output?: unknown;
}

/**
 * Open shape — handler PRDs (127–132) extend with stage-specific fields
 * (e.g. `duration_ms`, `model`, `input_tokens`). The shared header is
 * `ok | skipped` so consumers can group across kinds without knowing
 * per-handler schemas.
 */
export interface IngestStageRecord {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  [k: string]: unknown;
}

/**
 * Job result the worker posts to `food.ingest.workerComplete`. Both
 * variants carry `meta` so observability survives even on failure.
 * `retryAfterSec` lets PRD-129 surface Instagram's `Retry-After`
 * header back into BullMQ's backoff.
 */
export type IngestJobResult =
  | { ok: true; dsl: string; meta: IngestMeta; partialReason?: PartialReason }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      meta: IngestMeta;
      retryAfterSec?: number;
    };

/** Shared queue-name constant. Consumers must use this string verbatim. */
export const FOOD_INGEST_QUEUE_NAME = 'food.ingest';
