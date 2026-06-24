# Worker Container

**Status: Partial.** The BullMQ worker daemon, dispatch shell, REST callback, health
endpoint, and compose wiring are shipped. The image does NOT bake the media toolchain
(yt-dlp / ffmpeg / faster-whisper + model) — the worker shells out to those binaries but
the published `node:22-slim` image lacks them, so the Instagram acquisition/STT/keyframe
stages fail at runtime. That bake is deferred to
[ideas/worker-media-toolchain-image](../../ideas/worker-media-toolchain-image.md).

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

The long-running food worker consumes BullMQ `food.ingest` jobs (producer side:
`ingest-api` PRD), runs the per-kind extraction pipeline, and POSTs results back to the
food pillar's internal-token-gated REST callback. This PRD owns the container lifecycle,
runtime config, dispatch shell, callback transport, and health surface — the per-kind
extraction logic lives in the `web-jsonld`, `web-llm-fallback`, `instagram-acquisition`,
`instagram-stt-vision`, `screenshot-ingest`, and `text-ingest` PRDs.

## Image & deployment

The food pillar ships **one** image (`pillars/food/Dockerfile`, `node:22-slim` + `curl`)
with two roles selected by container CMD:

- `node dist/api/server.js` — the food REST API (default CMD).
- `node dist/worker/worker.js` — this worker daemon.

`docker-compose.yml` runs both off the same `ghcr.io/knoxio/pops-food` image: the
`food-api` service and the `pops-worker-food` service (the latter overrides
`command: ['node', 'dist/worker/worker.js']`). The publish pipeline builds the single
`pops-food` image; the worker needs no separate image build.

The image is built standalone from the `@pops/food...` pnpm subgraph (only its transitive
`@pops/*` deps are present in the build context). Watchtower labels are set for homelab
auto-roll.

## Runtime config

`loadConfig()` reads env once at boot, with a `/run/secrets/<lowercased-name>` file
fallback before `process.env` (Docker secrets convention). Boot **fails fast** if
`POPS_API_INTERNAL_TOKEN` is absent.

| Env                            | Default                          | Meaning                                                                             |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| `REDIS_URL`                    | `redis://localhost:6379`         | BullMQ connection (`maxRetriesPerRequest: null`, required for blocking commands).   |
| `POPS_API_URL`                 | `http://localhost:3000`          | food-api base URL for the callback (compose: `http://food-api:3005`).               |
| `POPS_API_INTERNAL_TOKEN`      | — (required)                     | Shared secret for the callback header.                                              |
| `FOOD_WORKER_CONCURRENCY`      | `2`                              | Jobs processed in parallel per container.                                           |
| `FOOD_INGEST_RATE_PER_MIN`     | `30`                             | BullMQ limiter ceiling (`max` over 60 s).                                           |
| `FOOD_INGEST_TIMEOUT_SEC`      | `300`                            | Per-job in-band timeout.                                                            |
| `FOOD_WORKER_HEALTH_PORT`      | `9090`                           | Health server port.                                                                 |
| `FOOD_WORKER_DRAIN_TIMEOUT_MS` | `60000`                          | SIGTERM drain window before forced exit.                                            |
| `FOOD_INGEST_DIR`              | `/data/food/ingest`              | Per-source media workdir (mounted volume).                                          |
| `INSTAGRAM_COOKIES_PATH`       | `/secrets/instagram-cookies.txt` | Netscape cookies for yt-dlp (compose mounts the `instagram_cookies` Docker secret). |

Positive-integer env vars throw on a non-integer / non-positive value rather than silently
defaulting.

## Queue contract

`food.ingest` queue name is the shared constant `FOOD_INGEST_QUEUE_NAME`. Job data is a
discriminated union on `kind`:

- `{ kind: 'url-web'; sourceId; url }`
- `{ kind: 'url-instagram'; sourceId; url }`
- `{ kind: 'text'; sourceId; body }`
- `{ kind: 'screenshot'; sourceId; mimeType; contentPath }` — large binaries are NOT
  inlined in Redis; the API writes the payload under `${FOOD_INGEST_DIR}/<sourceId>/` and
  the job carries only the path.

Job result is `{ ok: true; dsl; meta; partialReason? }` or
`{ ok: false; errorCode; errorMessage; meta; retryAfterSec? }`. `meta` (`IngestMeta`)
carries `extractor_version` + a per-stage `stages` record so observability survives even
on failure.

## Dispatch

`runIngestJob(data, ctx, handlers)` switches on `data.kind` into a typed handler registry.
The switch narrows the discriminant into each handler (no casts) and the compiler enforces
exhaustiveness via a `never`-typed default branch — adding a kind without a handler fails
typecheck. The registry is injectable so tests substitute deterministic mocks. All four
kinds route to real pipelines today; the `NotImplemented` stub utility survives only to
bootstrap a future kind.

## Worker lifecycle

`startWorker(config)` constructs a BullMQ `Worker` over `food.ingest` with the configured
`concurrency` and `limiter: { max: ratePerMin, duration: 60_000 }`. Per job, `processJob`:

1. Builds a `HandlerContext` whose `isCancelled()` polls `job.getState() === 'unknown'`
   (cancellation = the producer's `cancel` calling `job.remove()`; BullMQ has no
   `isToBeRemoved()`).
2. Races `runIngestJob(data, ctx)` against a `setTimeout(jobTimeoutSec)`; on timeout it
   resolves a `TimedOut` failure result (BullMQ has no native per-job timeout).
3. POSTs the result to the callback. A callback failure is rethrown so BullMQ retries the
   whole job.

A `SIGTERM`/`SIGINT` handler runs `shutdown()`, which races `worker.close()` against
`drainTimeoutMs` (active jobs drain up to 60 s), closes the health server, and quits Redis.
`completed` / `failed` / `active` events maintain an active-job set for the health surface
and emit structured logs.

## Internal callback (REST)

The worker POSTs `POST /ingest/worker-complete` on the food-api (ts-rest contract, plain
JSON body — NOT tRPC). Auth is the shared secret in an `x-pops-internal-token` header,
matched against `POPS_API_INTERNAL_TOKEN` by the `requireInternalToken` middleware in
`api/app.ts`, which gates only the `/ingest/worker-complete` path; everything else trusts
the docker network. A mismatched/absent token returns 401.

Server-side, `applyWorkerComplete` is **idempotent** and transactional:

- `ok: true` → creates a draft recipe + first (uncompiled) version and stamps the
  `ingest_sources` row in one transaction; a re-run that finds an existing `draftRecipeId`
  returns it instead of re-inserting (BullMQ-retry safe).
- `ok: false` → writes `meta` + `error_code` + `error_message` to the row.

The worker is **stateless** w.r.t. the DB — it never writes SQLite directly; the API owns
schema integrity. Recipe creation and compilation are the API's job, never the worker's.

## Health & observability

`GET /healthz` (port 9090) returns `{ ok: true, queueRunning, activeJobs }`; any other
path/method is 404. Compose healthchecks it via `curl`. Logs are pino structured JSON to
stdout; per-job lines carry `jobId` + `sourceId` for correlation with `ingest_sources`
rows.

## Business rules

- Worker is stateless against the API; the DB is the source of truth, written only via the
  callback.
- All file IO stays under `${FOOD_INGEST_DIR}` (mounted volume); the worker never writes
  outside it.
- Long-running process; crashes restart via compose `restart: unless-stopped`; BullMQ
  stalled detection recovers in-flight jobs after restart.
- Cancellation is cooperative — handlers check `ctx.isCancelled()` only at stage
  boundaries. Mid-stage cancellation requires killing the process (BullMQ stalled retry).
- Horizontal scaling is safe: BullMQ guarantees each job is processed by exactly one
  worker.

## Edge cases

| Case                                           | Behaviour                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POPS_API_INTERNAL_TOKEN` missing              | Boot fails fast (config throws).                                                                            |
| Callback fails (network partition to food-api) | `processJob` rethrows; BullMQ retries the whole job.                                                        |
| Job exceeds `FOOD_INGEST_TIMEOUT_SEC`          | `Promise.race` resolves a `TimedOut` result; callback records the failure.                                  |
| Producer cancels mid-job                       | `job.remove()` → next `getState()` is `'unknown'` → handler returns `Cancelled` at the next stage boundary. |
| `sourceId` not found on callback               | Server throws `WorkerCompleteSourceNotFound`; callback returns non-2xx; worker retries.                     |
| Worker shuts down with N active jobs           | `worker.close()` drains up to `drainTimeoutMs` (60 s); overflow jobs BullMQ-retry.                          |
| Two worker containers on one queue             | Each job processed exactly once; safe to scale.                                                             |
| Instagram job on the current image             | Fails at runtime — yt-dlp/ffmpeg/faster-whisper not in the image (see idea: worker-media-toolchain-image).  |

## Acceptance criteria

- [x] One `pillars/food/Dockerfile` builds the shared `pops-food` image; default CMD is the API server, compose overrides the worker service to `dist/worker/worker.js`.
- [x] `pops-worker-food` compose service runs the worker off the shared image with redis + food-api `depends_on` health gates, the `food-ingest-data` volume, and the `instagram_cookies` / `pops_api_internal_token` / `claude_api_key` secrets.
- [x] `loadConfig()` reads env with `/run/secrets` fallback and fails fast when `POPS_API_INTERNAL_TOKEN` is absent; positive-int vars reject bad values.
- [x] BullMQ `Worker` connects to `food.ingest`, honours `concurrency` + `{ max, duration: 60000 }` limiter, and dispatches via `runIngestJob`.
- [x] `runIngestJob` routes each `kind` to its handler with an exhaustive, cast-free switch over an injectable registry.
- [x] Per-job timeout via `Promise.race` yields a `TimedOut` result; cancellation polls `job.getState() === 'unknown'` and short-circuits with `Cancelled`.
- [x] `SIGTERM`/`SIGINT` drains active jobs up to `drainTimeoutMs` (60 s) then exits; health server + Redis close cleanly.
- [x] Worker POSTs `POST /ingest/worker-complete` with the `x-pops-internal-token` header; food-api's `requireInternalToken` middleware 401s a missing/wrong token and gates only that path.
- [x] `applyWorkerComplete` is transactional and idempotent: `ok:true` creates an uncompiled draft (or returns the existing `draftRecipeId` on retry); `ok:false` records `error_code`/`error_message`/`meta`.
- [x] `GET /healthz` on 9090 returns `{ ok, queueRunning, activeJobs }`; compose healthcheck passes; logs are pino JSON with `jobId`/`sourceId`.
- [x] Unit tests cover dispatch (each kind + cancellation threading + verbatim result), config loading, the health endpoint, and the timeout path.

## Out of scope

- Per-kind extraction logic — the `web-jsonld`, `web-llm-fallback`, `instagram-acquisition`, `instagram-stt-vision`, `screenshot-ingest`, `text-ingest` PRDs.
- Producer side (enqueue endpoint, queue config) — the `ingest-api` PRD.
- AI usage logging — the `ai-usage-prompts` PRD.
- Media toolchain image bake (yt-dlp / ffmpeg / faster-whisper + model), `versions.json`, and a testcontainers integration test — see [ideas/worker-media-toolchain-image](../../ideas/worker-media-toolchain-image.md).
- FIFO media eviction — see [ideas/ingest-media-retention](../../ideas/ingest-media-retention.md).
