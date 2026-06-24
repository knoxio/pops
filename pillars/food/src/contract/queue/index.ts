/**
 * BullMQ contract for the `food.ingest` queue
 * (pillars/food/docs/prds/ingest-api).
 *
 * Defines:
 *   - The job-data discriminated union the producer (`food.ingest.start`)
 *     enqueues and the worker (pillars/food/docs/prds/worker-container) reads.
 *   - The job-result discriminated union the worker returns via
 *     `food.ingest.workerComplete`.
 *   - `IngestMeta` — the per-source observability rollup persisted to
 *     `ingest_sources.extracted_json`. The per-modality handlers each
 *     populate the stages they ran; this file owns the shared envelope only.
 *   - `PartialReason` — the closed enum of "produced a draft but with
 *     caveats" outcomes.
 *
 * The contract is pure types + a queue-name constant; no runtime deps.
 * The producer (food-api) and the worker run in separate containers but
 * share one `@pops/food` package, importing these types via the `./queue`
 * subpath export — this file is the only seam where they agree on shape.
 */

/** Closed enum: a handler emits one of these on a successful-with-caveats run. */
export type PartialReason =
  | 'auth-dead' // IG cookies expired.
  | 'rate-limited' // yt-dlp rate-limited; delayed retry.
  | 'stt-failed' // faster-whisper failed; caption + vision used instead.
  | 'vision-failed' // vision call failed; text-LLM fallback used.
  | 'caption-only-fallback' // STT + vision both failed.
  | 'empty-extraction'; // LLM produced 0 ingredients or 0 steps.

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
 * owns the stages it writes; this file documents the envelope.
 * Stages whose handler skipped them set `skipped: true` and a `reason`.
 */
export interface IngestMeta {
  /** Semicolon-delimited tool versions; e.g. `pipeline-v1;whisper-distil;claude-haiku-4-5`. */
  extractor_version: string;
  /**
   * Per-stage records keyed by stage name. Stage names are owned per
   * handler. The value is typed `unknown` so the producer doesn't have
   * to validate handler-specific stage payloads — consumers narrow via
   * `IngestStageRecord` where they care about the shared
   * `ok` / `skipped` / `reason` header.
   */
  stages: Record<string, unknown>;
  total_duration_ms?: number;
  total_cost_usd?: number;
  /** The LLM's raw structured output before draft insertion (when an LLM was used). */
  llm_raw_output?: unknown;
}

/**
 * Open shape — per-modality handlers (pillars/food/docs/prds, e.g.
 * web-jsonld, instagram-stt-vision, screenshot-ingest, text-ingest)
 * extend with stage-specific fields (e.g. `duration_ms`, `model`,
 * `input_tokens`). The shared header is `ok | skipped` so consumers can
 * group across kinds without knowing per-handler schemas.
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
 * `retryAfterSec` lets the Instagram acquisition handler surface
 * Instagram's `Retry-After` header back into BullMQ's backoff.
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
