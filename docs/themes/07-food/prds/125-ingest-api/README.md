# PRD-125: Ingest API & BullMQ Queue Contract

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Define the producer side of the ingestion pipeline: the `POST /api/food/ingest` endpoint, the BullMQ queue contract that the food worker consumes (PRD-126), the job-shape per ingest kind, retry / backoff / timeout semantics, and the status query API the shell uses to poll job progress. This PRD owns the boundary between pops-api (producer) and pops-worker-food (consumer); everything else in Epic 02 plugs in on one side of it.

The endpoint also writes the initial `ingest_sources` row (PRD-110) so the worker has a stable target ID before processing starts.

## Ingest API

```ts
// apps/pops-api/src/modules/food/router.ts (extended; introduced when Epic 00 services land)
export const ingestRouter = {
  start: mutation({
    input:
      | { kind: 'url-web';        url: string }
      | { kind: 'url-instagram';  url: string }
      | { kind: 'text';           body: string }
      | { kind: 'screenshot';     mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; contentBase64: string },
    output: { sourceId: number; jobId: string; queuedAt: string },
  }),

  status: query({
    input: { sourceId: number },
    output: IngestStatus,
  }),

  list: query({                                          // for the review queue (Epic 03)
    input: { state?: 'pending' | 'processing' | 'completed' | 'failed', cursor?: string, limit?: number },
    output: { items: IngestSummary[], nextCursor?: string },
  }),

  cancel: mutation({                                     // operator-initiated cancel
    input: { sourceId: number },
    output: { ok: true } | { ok: false, reason: 'not-cancellable' },
  }),

  retry: mutation({                                      // re-enqueue a failed ingest
    input: { sourceId: number },
    output: { jobId: string, queuedAt: string },
  }),
};

export type IngestStatus = {
  sourceId: number;
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  jobId: string | null;                       // null after BullMQ TTL expires
  startedAt: string | null;
  completedAt: string | null;
  draftRecipeId: number | null;               // set when ingest produces a draft (success or partial)
  partialReason?: PartialReason;
  errorCode?: string;
  errorMessage?: string;
  meta?: IngestMeta;                          // see "Meta JSON shape" below
};

export type PartialReason =
  | 'auth-dead'              // PRD-129: IG cookies expired
  | 'rate-limited'           // PRD-129: yt-dlp rate-limited; delayed retry
  | 'stt-failed'             // PRD-130: faster-whisper failed; caption + vision used instead
  | 'vision-failed'          // PRD-130: vision call failed; text-LLM fallback used
  | 'caption-only-fallback'  // PRD-130: STT + vision both failed; caption-only extraction
  | 'empty-extraction';      // PRD-128 / 130 / 131 / 132: LLM produced 0 ingredients or 0 steps
```

### Flow

`start` mutation:

1. Validate input by kind (URL well-formed; text non-empty; base64 size ≤ 8 MB matching PRD-124 cap).
2. Create `ingest_sources` row (PRD-110) with the field mapping below.
3. For `kind='screenshot'`: decode the base64 to disk at `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` BEFORE enqueue.
4. Enqueue a BullMQ job on `food.ingest` queue with the job data shape below.
5. Return `sourceId` (the `ingest_sources` row ID) and `jobId` (BullMQ).

#### Input → `ingest_sources` column mapping

| Input kind      | `kind`            | `url`       | `caption`                               | Other                                         |
| --------------- | ----------------- | ----------- | --------------------------------------- | --------------------------------------------- |
| `url-web`       | `'url-web'`       | `input.url` | NULL                                    | —                                             |
| `url-instagram` | `'url-instagram'` | `input.url` | NULL (populated by worker after yt-dlp) | —                                             |
| `text`          | `'text'`          | NULL        | `input.body`                            | Body also carried inline in BullMQ job        |
| `screenshot`    | `'screenshot'`    | NULL        | NULL                                    | Decoded file at `<sourceId>/screenshot.<ext>` |

`extractor_version` is set to the current pipeline version string. `ingested_at=now()`. `draft_recipe_id=NULL` until the worker completes.

`status` query: server fetches the BullMQ job state (or returns `state='completed'`/`'failed'` from the DB if the job has aged out of BullMQ's TTL). Used by the shell to poll progress.

`cancel`: only allowed if state is `pending` or `processing`. Sets a BullMQ removal flag; the worker is responsible for checking cancellation between pipeline stages (PRD-126).

`retry`: re-enqueues a failed job with the same input. Creates a fresh `jobId` but reuses the same `sourceId` (the DB row persists; only its state changes).

## BullMQ Job Shape

```ts
// packages/app-food/src/jobs/ingest-job.ts
export type IngestJobData =
  | { kind: 'url-web'; sourceId: number; url: string }
  | { kind: 'url-instagram'; sourceId: number; url: string }
  | { kind: 'text'; sourceId: number; body: string }
  | { kind: 'screenshot'; sourceId: number; mimeType: string; contentPath: string };

// Per-kind handlers produce the DSL + meta; they do NOT create the draft directly.
// The worker then calls `food.ingest.workerComplete` (below) which atomically:
//   (a) creates the recipe + version via PRD-119's `food.recipes.create` if `ok: true`,
//   (b) updates `ingest_sources.draft_recipe_id` + `extracted_json` with the meta rollup.
// This keeps DB writes server-side and gives the worker a single round-trip per ingest.
export type IngestJobResult =
  | { ok: true; dsl: string; meta: IngestMeta; partialReason?: PartialReason }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      meta: IngestMeta;
      retryAfterSec?: number;
    };

export const FOOD_INGEST_QUEUE_NAME = 'food.ingest';
```

`retryAfterSec` (optional) on a failure result tells BullMQ to delay the next attempt by this many seconds — used by PRD-129's rate-limited path which surfaces Instagram's `Retry-After` header.

For `screenshot` kind: the base64 payload from the API is decoded and written to a temp file under `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` BEFORE enqueue, so the BullMQ job carries only a path (no large binary in Redis). The worker reads the file and processes it.

For `text` kind: the body is stored in `ingest_sources.caption` AND the job carries the body inline (small text; OK in Redis).

For `url-*` kinds: just the URL.

### Queue configuration

```ts
new Queue(FOOD_INGEST_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
    removeOnComplete: { count: 1000 }, // keep last 1000 for status query
    removeOnFail: { count: 1000 },
  },
});
```

Stalled-job detection enabled with `stalledInterval: 30000` and `maxStalledCount: 1`.

Rate limit (per Anthropic API key): use BullMQ's worker-side `limiter: { max: 30, duration: 60000 }` (30 jobs/min default; configurable via `FOOD_INGEST_RATE_PER_MIN`). The 30/min default is conservative — Anthropic rate limits per API key are higher; lower bound protects against runaway spend.

## Meta JSON Shape

Persisted as a JSON-encoded string in `ingest_sources.extracted_json` (existing column from PRD-110) — note: PRD-110 reserves that column for "the LLM's structured output that became the draft"; this PRD widens the column's meaning to hold the whole observability rollup (which embeds the LLM raw output as a nested field). The rollup captures pipeline observability per ingest:

```json
{
  "extractor_version": "pipeline-v1.0;yt-dlp-2026.01.15;faster-whisper-distil-large-v3;claude-haiku-4-5-20251001",
  "stages": {
    /* per-stage records keyed by stage name; ILLUSTRATIVE shape only.
       Each handler PRD (127-132) defines exactly which stages it writes.
       Stage names below are example values; consult per-PRD §"Meta JSON additions". */
    "fetch": { "ok": true, "duration_ms": 1240 },
    "caption_heuristic": { "structured": true },
    "stt": { "ok": false, "skipped": true, "reason": "caption-was-structured" },
    "keyframes": { "ok": true, "duration_ms": 850, "count": 8 },
    "vision": {
      "ok": true,
      "duration_ms": 4120,
      "model": "claude-haiku-4-5-20251001",
      "input_tokens": 1452,
      "output_tokens": 380,
      "cost_usd": 0.0021
    },
    "dsl_build": { "ok": true, "duration_ms": 110 },
    "compile": { "ok": true, "duration_ms": 90, "creations": 3, "proposedSlugs": 0 }
  },
  "total_duration_ms": 6415,
  "total_cost_usd": 0.0021,
  "llm_raw_output": {
    /* the LLM's raw JSON output before draft insertion (when an LLM was used) */
  }
}
```

Each ingest kind populates the stages it ran. Skipped stages have `skipped: true` and a `reason`. PRD-133 logs each LLM call to `ai_inference_log` separately; the meta JSON is a per-source rollup for observability and review.

**Stage names are owned by the per-kind PRDs.** PRD-125 lists illustrative values; the canonical set used in tests / UI grouping is the union of what PRDs 127-132 actually emit. See each handler PRD's §"Meta JSON additions" for its stage names.

## `food.ingest.workerComplete` (internal)

Called by `pops-worker-food` (PRD-126) at the end of every job, success or failure. Auth'd via `POPS_API_INTERNAL_TOKEN` header (same mechanism as PRD-133's `food.ai.logInference`); NOT exposed via OpenAPI to user-facing clients.

```ts
food.ingest.workerComplete: mutation({
  input:
    | { sourceId: number; ok: true;  dsl: string; meta: IngestMeta; partialReason?: PartialReason }
    | { sourceId: number; ok: false; errorCode: string; errorMessage: string; meta: IngestMeta },
  output:
    | { ok: true;  draftRecipeId: number; compileStatus: 'compiled' | 'failed' | 'uncompiled' }
    | { ok: false; reason: string },
});
```

### Server-side execution

On `ok: true`:

1. In one Drizzle transaction:
   - Call `food.recipes.create({ dsl, sourceId })` (PRD-119) — creates the recipe + draft version + slug_registry rows; runs PRD-116's compile.
   - UPDATE `ingest_sources` SET `extracted_json = <meta as JSON>`, `draft_recipe_id = <new recipe id>`.
2. Return the resulting `draftRecipeId` and the compile result's `compile_status`.

On `ok: false`:

1. UPDATE `ingest_sources` SET `extracted_json = <meta as JSON>` (no draft created).
2. Return `{ ok: false, reason: errorCode }`.

This server-side ordering ensures `ingest_sources.draft_recipe_id` is FK-consistent with `recipes.id` (the recipe is created in the same transaction). Handlers never call `food.recipes.create` directly — only `workerComplete`.

## Requires (cross-epic dependencies)

- **PRD-107** (`recipe_versions` schema) — the draft this pipeline ultimately produces.
- **PRD-110** (`ingest_sources` table + `FOOD_INGEST_DIR` filesystem layout) — provenance.
- **PRD-115** (DSL resolver `creations` flow) — invoked during compile when ingest produces unknown ingredient/variant slugs.
- **PRD-116** (compile function) — invoked by `food.recipes.create` during workerComplete.
- **PRD-119** (`food.recipes.create` mutation) — the creation path used by `workerComplete`.
- **PRD-133** (AI usage logging) — every LLM call from handlers routes through `callClaudeWithLogging`.
- Existing Redis + BullMQ infrastructure (theme 01 / 02).

## Business Rules

- `start` ALWAYS creates an `ingest_sources` row, even if the job fails to enqueue (defensive — the row records the attempt). The row's `extracted_json` is null until the worker processes.
- `start` validates input shape; rejects malformed URLs, empty text, oversized base64, unknown mime types.
- The shell shows the `sourceId` to the user immediately ("Ingest queued — sourceId 42"); polls `status` until terminal state.
- `cancel` is best-effort: a job in mid-flight may complete before the worker checks the cancellation flag. Surface "cancellation requested" until the worker confirms.
- `retry` re-enqueues with the same input but a fresh `extractor_version` snapshot. Old `extracted_json` is overwritten on success.
- Worker writes back to `ingest_sources` via the `food.ingest.workerComplete` mutation defined above. The mutation handles both DB writes (recipe creation via PRD-119 and ingest_sources update) in one transaction. Worker never touches the DB directly.
- `state='partial'` is a success variant: a draft was produced but with caveats (e.g. caption-only fallback after STT failure). Review queue surfaces these prominently.

## Edge Cases

| Case                                                                                  | Behaviour                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| User submits malformed Instagram URL                                                  | `start` rejects with `InvalidIngestInput`; no row created.                                                                           |
| Redis is down                                                                         | `start` fails with 503; no row created. Shell shows toast asking the user to retry later.                                            |
| Worker crashes mid-job                                                                | BullMQ stalled detection picks it up after `stalledInterval`; retried up to `attempts`. After all attempts, marked `failed`.         |
| `status` polled after BullMQ TTL aged the job out                                     | DB state (`ingest_sources.extracted_json` plus `draft_recipe_id`) is the source of truth; `jobId` returns null but state is correct. |
| User submits same URL twice within 5 seconds                                          | Two `ingest_sources` rows, two jobs. No dedup in v1.                                                                                 |
| Job result references a draft recipe that was deleted by user before worker completed | Worker UPDATE of `ingest_sources.draft_recipe_id` fails (FK violation); job marked failed with `DraftDeletedDuringIngest`.           |
| `cancel` called on a job already in `completed` state                                 | Returns `{ ok: false, reason: 'not-cancellable' }`.                                                                                  |
| Worker timeout (`FOOD_INGEST_TIMEOUT_SEC` exceeded)                                   | BullMQ stalled detector kills the job; marked failed with `Timeout`. Operator inspects logs.                                         |
| Operator removes `food` module mid-job                                                | Worker continues until the job completes (idempotency); future enqueues fail because the route is gone.                              |

## Acceptance Criteria

Inline per theme protocol.

### Endpoint

- [ ] `POST /api/food/ingest` (via tRPC) accepts the input variants per the API section.
- [ ] Each kind validates its required fields; rejects malformed input with `InvalidIngestInput`.
- [ ] Screenshot input writes the base64 payload to disk under `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` before enqueue.
- [ ] Returns `{ sourceId, jobId, queuedAt }`.

### Queue

- [ ] `FOOD_INGEST_QUEUE_NAME = 'food.ingest'` constant exported from `packages/app-food/src/jobs/ingest-job.ts`.
- [ ] Queue configured with `attempts=3`, exponential backoff, stalled detection, rate limiter.
- [ ] `FOOD_INGEST_RATE_PER_MIN`, `FOOD_INGEST_TIMEOUT_SEC`, `FOOD_WORKER_CONCURRENCY` env vars wired with sensible defaults (30, 300, 2 respectively).

### Status & control

- [ ] `status` returns the correct state by combining BullMQ state + DB row state.
- [ ] `list` query supports filtering by state, paginated via cursor.
- [ ] `cancel` sets the BullMQ removal flag; worker honours it (verified via PRD-126 acceptance).
- [ ] `retry` re-enqueues a failed job with same input and same `sourceId`.

### Worker integration

- [ ] `food.ingest.workerComplete` internal mutation accepts the `IngestJobResult` shape, writes `ingest_sources.extracted_json` + `meta.json` + `draft_recipe_id`, and is auth'd via an internal token (not exposed to user-facing OpenAPI).

### Tests

- [ ] Vitest integration suite at `apps/pops-api/src/modules/food/__tests__/ingest-router.test.ts` covers each kind's happy path and key error states.
- [ ] Vitest test asserts that screenshot payload is written to disk before enqueue.
- [ ] Vitest test asserts retry creates a fresh jobId but reuses sourceId.
- [ ] Integration test for stalled-job recovery (mock BullMQ delay > stalledInterval).

## Out of Scope

- Worker container implementation — **PRD-126**.
- Per-kind extraction logic — **PRDs 127-132**.
- AI usage logging — **PRD-133**.
- Review queue UI consuming `list` — **Epic 03**.
- Multipart upload for screenshots — base64 over tRPC in v1 (matches PRD-124).
- Webhook for downstream consumers (e.g. notification on completion) — none in v1.
- Job priority queues (urgent vs normal) — single priority in v1.
- Cross-ingest dedup — deferred.
