# Ingest API & Queue Contract

Status: **Done** — producer endpoints, BullMQ queue, worker dispatch, and the
worker-complete callback all ship. Deferred pieces (delayed-retry from
`retryAfterSec`, native stalled-job detection, compile-on-complete, dedup, a
submission UI) live in `../../ideas/ingest-queue-resilience.md`.

The producer side of the recipe-ingest pipeline. The food-api container is the
BullMQ producer: it accepts an ingest request, writes the provenance row,
enqueues a `food.ingest` job, and answers status/list/cancel/retry. The
`pops-worker-food` container (see `prds/worker-container`) is the consumer; it
posts results back through one internal `worker-complete` callback. This
contract is the only seam where producer and consumer agree on shape — the
job-data / job-result / meta types are defined in `src/contract/queue/index.ts`
and exposed to the worker via the pillar's `@pops/food/queue` subpath export.

## Data model

`ingest_sources` (`src/db/schema/food-ingest-sources.ts`) — one row per ingest
run, created up front by `start`:

| Column                         | Notes                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| `id`                           | autoincrement; this is the `sourceId` returned to the caller               |
| `kind`                         | `url-web` \| `url-instagram` \| `text` \| `screenshot`                     |
| `url`                          | set for `url-*` kinds                                                      |
| `caption`                      | set for `text` kind (the body); IG caption populated later by worker       |
| `extracted_json`               | the `IngestMeta` observability rollup (JSON string); written on completion |
| `extractor_version`            | pipeline/tool version string; `pipeline-v1.0` placeholder at `start`       |
| `draft_recipe_id`              | FK → `recipes.id`; NULL until a successful worker-complete                 |
| `error_code` / `error_message` | set on a failure callback; survive BullMQ TTL expiry                       |
| `attempts`                     | 0 at `start`; incremented by `retry`                                       |
| `ingested_at`                  | `datetime('now')` default                                                  |

Screenshot bytes are never stored in the DB or in Redis: `start` decodes the
base64 to `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` and the job carries
only the relative path. (`transcript_path`, `keyframes_dir`, `video_path`,
`archived_at`, `reviewed_at` belong to the worker / retention / review PRDs.)

## REST surface

All routes mount under the pillar prefix; reads use POST-with-body (typed
numbers/cursors don't round-trip cleanly through query strings).

| Endpoint                                            | Body → Result                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /ingest/start`                                | discriminated input by kind → `{ sourceId, jobId, queuedAt }`; **503** when Redis unconfigured                                       |
| `POST /ingest/status`                               | `{ sourceId }` → `IngestStatus \| null`                                                                                              |
| `POST /ingest/list`                                 | `{ state?, cursor?, limit≤100=20 }` → `{ items, nextCursor? }`                                                                       |
| `POST /ingest/cancel`                               | `{ sourceId }` → `{ ok:true } \| { ok:false, reason:'not-cancellable' }`                                                             |
| `POST /ingest/retry`                                | `{ sourceId }` → `{ jobId, queuedAt }`; **503** when Redis unconfigured                                                              |
| `POST /ingest/worker-complete`                      | `IngestJobResult` → `{ ok:true, draftRecipeId, compileStatus } \| { ok:false, reason }` — internal, gated by `x-pops-internal-token` |
| `GET /ingest/source/:id/screenshot` · `GET …/video` | binary media for the inbox UI                                                                                                        |

`start` input (discriminated on `kind`): `url-web`/`url-instagram` carry a valid
`url`; `text` carries a non-empty `body`; `screenshot` carries
`mimeType ∈ {image/jpeg,image/png,image/webp}` + `contentBase64`.

`IngestStatus`: `{ sourceId, kind, state, jobId, startedAt, completedAt,
draftRecipeId, partialReason?, errorCode?, errorMessage?, attempts }` where
`state ∈ {pending, processing, completed, failed, partial}` and `partialReason`
is the closed enum `{auth-dead, rate-limited, stt-failed, vision-failed,
caption-only-fallback, empty-extraction}`.

## Queue contract (`food.ingest`)

`FOOD_INGEST_QUEUE_NAME = 'food.ingest'`. Job data is one of
`url-web`/`url-instagram` (`{sourceId, url}`), `text` (`{sourceId, body}`),
`screenshot` (`{sourceId, mimeType, contentPath}`). Job result is
`{ok:true, dsl, meta, partialReason?}` or `{ok:false, errorCode, errorMessage,
meta, retryAfterSec?}`. `IngestMeta` = `{ extractor_version, stages:
Record<string,unknown>, total_duration_ms?, total_cost_usd?, llm_raw_output? }`;
each per-kind extractor (web-jsonld, web-llm-fallback, text-ingest,
screenshot-ingest, instagram-acquisition, instagram-stt-vision) owns its own
`stages` keys, so the producer validates `meta` permissively (envelope only).

Producer queue options: `attempts: 3`, `backoff: exponential 5s` (5s/10s/20s),
`removeOnComplete/removeOnFail: { count: 1000 }`. Worker options: `concurrency`
and `limiter: { max: ratePerMin, duration: 60_000 }`; per-job ceiling enforced
in-band via `Promise.race` against `FOOD_INGEST_TIMEOUT_SEC` (returns a
`TimedOut` failure). Env: `FOOD_WORKER_CONCURRENCY=2`, `FOOD_INGEST_RATE_PER_MIN=30`,
`FOOD_INGEST_TIMEOUT_SEC=300`.

## Business rules

- `start` ALWAYS creates the `ingest_sources` row first (records the attempt).
  For `screenshot` it writes the file to disk **before** enqueue. If enqueue
  throws (Redis down / queue closed), it rolls back the row + screenshot dir and
  re-throws → 503, so no phantom `pending` rows accumulate.
- Screenshot payload is rejected if the decoded size exceeds 8 MiB
  (`SCREENSHOT_MAX_BYTES`); a pre-decode char check rejects oversized base64
  before allocating the buffer. A `data:…;base64,` prefix is trimmed if present.
- `cancel` is best-effort: it removes the BullMQ job only if it is in a
  cancellable live state (`waiting`/`delayed`/`active`/`waiting-children`/
  `prioritized`); otherwise `not-cancellable`. The worker honours an in-flight
  cancel cooperatively by polling `job.getState() === 'unknown'` between stages.
- `retry` rebuilds job-data from the persisted row (recovering screenshot mime
  from the on-disk filename), re-enqueues with the **same** `sourceId`, bumps
  `attempts`, and clears `error_code`/`error_message`.
- `worker-complete` is idempotent and transactional. On `ok:true` it creates an
  **uncompiled** draft recipe + first version and sets `draft_recipe_id` +
  `extracted_json` in one transaction (a re-run returns the existing
  `draftRecipeId` instead of duplicating the slug); `compileStatus` is always
  `'uncompiled'` here — compile runs later at inbox approval. On `ok:false` it
  writes `extracted_json` + `error_code`/`error_message`, no draft. The worker
  never touches the DB directly.
- `state` is derived by combining live BullMQ state with the DB row: an
  `error_code` → `failed`; a `draft_recipe_id` → `completed`, or `partial` when
  `extracted_json.partialReason` is set; otherwise the mapped BullMQ state, or
  `pending` once the job has aged out of Redis.

## Edge cases

- Malformed URL / empty text / unknown mime / oversized base64 → input rejected
  before any row is created.
- Redis down → `start`/`retry` answer 503; no phantom row left behind.
- Job aged out of BullMQ TTL → `jobId` is null but DB-row state is authoritative.
- Same URL twice in quick succession → two rows, two jobs (no dedup in v1).
- `cancel` on an already-completed job → `{ ok:false, reason:'not-cancellable' }`.

## Acceptance criteria

- [x] `POST /ingest/start` accepts the four kind variants, validates each kind's
      required fields, and returns `{ sourceId, jobId, queuedAt }`.
- [x] `screenshot` input is decoded and written to
      `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` before enqueue; payloads
      over 8 MiB are rejected.
- [x] `start`/`retry` answer 503 when Redis is unconfigured, and `start` rolls
      back the row (no phantom `pending` rows) on enqueue failure.
- [x] Queue configured with `attempts=3`, exponential backoff,
      `removeOnComplete/Fail: { count: 1000 }`; worker uses a per-minute rate
      limiter and an in-band per-job timeout.
- [x] `status` returns null for an unknown source and otherwise combines BullMQ
      live state with the DB row; `list` filters by `state` and paginates by
      cursor.
- [x] `cancel` removes a cancellable job and reports `not-cancellable` otherwise;
      `retry` re-enqueues the same input under the same `sourceId` and bumps
      `attempts`.
- [x] `worker-complete` creates an uncompiled draft on success (idempotent),
      records `error_code`/`error_message` on failure, and is rejected without a
      valid `x-pops-internal-token`.
- [x] `FOOD_INGEST_QUEUE_NAME`, the job-data/result unions, and `IngestMeta` are
      defined in `src/contract/queue/index.ts` and reachable from the worker via
      the pillar's `@pops/food/queue` subpath export.
- [x] Vitest suite (`src/api/__tests__/ingest.test.ts`) covers no-Redis
      degradation, row rollback, unknown-source status/cancel, worker-complete
      success/idempotency/failure, internal-token rejection, and media serving.

## Out of scope

- Worker container internals + per-kind extraction — `prds/worker-container`
  and the per-kind extractor PRDs (`web-jsonld`, `web-llm-fallback`,
  `text-ingest`, `screenshot-ingest`, `instagram-acquisition`,
  `instagram-stt-vision`).
- AI usage logging — `prds/ai-usage-prompts`. Review-queue UI consuming `list`
  — `prds/review-queue-page` / `prds/approve-reject-flow`.
- Multipart screenshot upload (base64 in v1), completion webhooks, job priority
  queues, cross-ingest dedup, delayed-retry / stalled-detection wiring, and a
  submission UI — see `../../ideas/ingest-queue-resilience.md`.
