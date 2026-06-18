# PRD-126: pops-worker-food Container

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Build the long-running Docker container that consumes BullMQ `food.ingest` jobs (PRD-125), executes the per-kind pipeline (PRDs 127-132), and writes results back via the worker-complete internal API. Container ships Node + Python + yt-dlp + ffmpeg + faster-whisper. Daemon mode: polls the queue, processes jobs sequentially within a configurable worker pool. This PRD owns the image, lifecycle, runtime config, and the dispatch shell — the per-kind ingest logic lives in the downstream PRDs.

## Image

### `infra/docker/pops-worker-food/Dockerfile`

Multi-stage build:

```dockerfile
# Stage 1: faster-whisper model bake
FROM python:3.12-slim AS model-baker
RUN pip install --no-cache-dir faster-whisper==<pinned>
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('distil-large-v3', device='cpu', compute_type='int8')"
# Model now cached under /root/.cache/huggingface/hub/

# Stage 2: runtime
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      python3-venv \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/*

# Pinned yt-dlp via pip (faster updates than apt)
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir \
      yt-dlp==<pinned> \
      faster-whisper==<pinned>
ENV PATH="/opt/venv/bin:${PATH}"

# Bring in the prebaked model
COPY --from=model-baker /root/.cache /root/.cache

# App
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist ./dist

# Working dirs (mounted in compose)
ENV FOOD_INGEST_DIR=/data/food/ingest
VOLUME ["/data/food/ingest"]

# Health endpoint
EXPOSE 9090

CMD ["node", "dist/worker.js"]
```

Pinned versions documented in the Dockerfile; updates are PRs that re-bake the image. Watchtower in homelab deploys auto-rolls based on image tag.

Image size target: <2 GB. Multi-stage build keeps the Python toolchain only in stage 1.

### Compose integration

Added to `infra/docker-compose.yml`:

```yaml
worker-food:
  image: ghcr.io/knoxio/pops-worker-food:latest
  restart: unless-stopped
  depends_on:
    - redis
    - api # for the workerComplete callback
  volumes:
    - ./data/food/ingest:/data/food/ingest
    - ./infra/secrets/instagram-cookies.txt:/secrets/instagram-cookies.txt:ro
  environment:
    REDIS_URL: ${REDIS_URL:-redis://redis:6379}
    POPS_API_URL: http://api:3000
    POPS_API_INTERNAL_TOKEN: ${POPS_API_INTERNAL_TOKEN}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    # Worker pool & rate limiting (PRD-125)
    FOOD_WORKER_CONCURRENCY: ${FOOD_WORKER_CONCURRENCY:-2}
    FOOD_INGEST_TIMEOUT_SEC: ${FOOD_INGEST_TIMEOUT_SEC:-300}
    FOOD_INGEST_RATE_PER_MIN: ${FOOD_INGEST_RATE_PER_MIN:-30}
    # Storage (PRD-110)
    FOOD_INGEST_DIR: ${FOOD_INGEST_DIR:-/data/food/ingest}
    # Cookie path (PRD-129)
    INSTAGRAM_COOKIES_PATH: /secrets/instagram-cookies.txt
    # Per-handler model overrides (PRDs 128, 130, 131, 132)
    FOOD_WEB_LLM_MODEL: ${FOOD_WEB_LLM_MODEL:-claude-haiku-4-5-20251001}
    FOOD_IG_VISION_MODEL: ${FOOD_IG_VISION_MODEL:-claude-haiku-4-5-20251001}
    FOOD_SCREENSHOT_VISION_MODEL: ${FOOD_SCREENSHOT_VISION_MODEL:-claude-haiku-4-5-20251001}
    FOOD_TEXT_LLM_MODEL: ${FOOD_TEXT_LLM_MODEL:-claude-haiku-4-5-20251001}
    # Cost observation (PRD-133's callClaudeWithLogging warns when exceeded)
    FOOD_INGEST_COST_CAP_PER_JOB_USD: ${FOOD_INGEST_COST_CAP_PER_JOB_USD:-0.05}
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:9090/healthz']
    interval: 30s
    timeout: 5s
    retries: 3
```

Cookie file is read-only mounted from a secret file under `infra/secrets/` (operator-managed; not committed). PRD-129 documents refresh procedure.

## Worker Daemon

### `apps/pops-worker-food/src/worker.ts`

The entry point (compiled to `dist/worker.js`) does:

```ts
async function main() {
  const ratePerMin = Number(process.env.FOOD_INGEST_RATE_PER_MIN ?? 30);

  const worker = new Worker(
    FOOD_INGEST_QUEUE_NAME,
    async (job) => {
      // Pass the whole job so handlers can inspect cancellation via `job.isToBeRemoved()`.
      return runIngestJob(job);
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.FOOD_WORKER_CONCURRENCY ?? 2),
      limiter: { max: ratePerMin, duration: 60_000 }, // PRD-125 contract; env-driven
    }
  );

  // Health server
  startHealthServer(9090, () => worker.isRunning());

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.close();
    await closeRedis();
    process.exit(0);
  });
}
```

`runIngestJob(job)` dispatches to the per-kind module, passing the BullMQ `Job` so handlers can check `job.isToBeRemoved()` between pipeline stages for cooperative cancellation:

```ts
async function runIngestJob(job: Job<IngestJobData>): Promise<IngestJobResult> {
  const data = job.data;
  const ctx: HandlerContext = { isCancelled: () => job.isToBeRemoved() };
  switch (data.kind) {
    case 'url-web':
      return runWebUrlIngest(data, ctx); // PRD-127 / 128
    case 'url-instagram':
      return runInstagramIngest(data, ctx); // PRD-129 + 130
    case 'screenshot':
      return runScreenshotIngest(data, ctx); // PRD-131
    case 'text':
      return runTextIngest(data, ctx); // PRD-132
  }
}

export type HandlerContext = {
  isCancelled: () => boolean | Promise<boolean>;
};
```

Each handler accepts `(data, ctx)` and is responsible for calling `await ctx.isCancelled()` between pipeline stages. If true, the handler returns early with `{ ok: false, errorCode: 'Cancelled', ... }`.

After `runIngestJob` returns, the worker shell calls `food.ingest.workerComplete(sourceId, result)` (per PRD-125) — the worker is NEVER responsible for creating the recipe directly; that's done server-side by the mutation.

### Cancellation

The worker checks `job.isToBeRemoved()` (BullMQ) between pipeline stages. If true, current stage finishes, no further stages run, and the job exits with `errorCode='Cancelled'`. Per-kind handlers must accept a cancellation token and respect it at stage boundaries — documented in PRDs 127-132.

### Timeout

Per-job timeout enforced by BullMQ stalled detection (set in PRD-125's queue config). If a stage hangs beyond `FOOD_INGEST_TIMEOUT_SEC`, the worker process is killed and BullMQ re-enqueues per the retry policy. Stage-level timeouts (e.g. "faster-whisper has 90s") live in the per-kind PRDs.

### Worker pool semantics

`concurrency=N` means N jobs run in parallel within one container instance. Default 2 to keep faster-whisper CPU + Claude vision token spend bounded. Operators can raise on beefier hardware; lower if resources are constrained.

## Internal API Auth

The worker calls back to pops-api via tRPC. Auth uses `POPS_API_INTERNAL_TOKEN` (shared secret) in an `X-Internal-Token` header. The api validates the header on the `food.ingest.workerComplete` mutation only (other mutations require user auth). Token rotation is operator-managed via env var.

## Health & Observability

`GET /healthz` returns `{ ok: true, queueRunning: boolean, activeJobs: number }`. Used by compose healthcheck and any external monitoring.

Worker logs (stdout) follow the existing POPS log format. Per-job log lines include `sourceId` and `jobId` for correlation with `ingest_sources` rows.

## Business Rules

- Worker is **stateless** with respect to the API — every result is written via `workerComplete`. The DB is the source of truth.
- Worker MUST NOT write to the SQLite DB directly. Schema enforcement and integrity belong to pops-api.
- All file IO happens under `${FOOD_INGEST_DIR}` (mounted volume). Worker never writes outside this dir.
- Worker process lifetime: long-running. Crashes restart via compose `restart: unless-stopped`. BullMQ stalled detection picks up any in-flight jobs after restart.
- Concurrent jobs share the same Anthropic API key and the same model cache. Faster-whisper instances per worker are NOT shared (memory) — each concurrent job loads its own.
- Cancellation is cooperative — handlers check between stages, not mid-stage. Mid-stage cancellation requires killing the process (BullMQ stalled retry).
- The worker never auto-updates yt-dlp at runtime — version is baked in. Operator upgrades by rebuilding the image.

## Edge Cases

| Case                                                                      | Behaviour                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `INSTAGRAM_COOKIES_PATH` file missing                                     | yt-dlp runs without cookies; most reels will fail with auth-walled error. PRD-129 detects and degrades. |
| `ANTHROPIC_API_KEY` missing                                               | Worker starts; first job needing Claude API fails. Health endpoint reports OK (queue running).          |
| Container hits OOM during faster-whisper load                             | Process killed; compose restarts; BullMQ retries the job. Operator should raise container memory limit. |
| Worker pool size > available CPU                                          | Jobs queue up internally; BullMQ-side rate limiter still throttles. Effective concurrency = CPU count.  |
| Worker can reach Redis but NOT pops-api (network partition)               | Job processes; `workerComplete` callback fails; BullMQ retries the job (which will reprocess on retry). |
| Two workers connected to the same queue (operator scaled to 2 containers) | BullMQ guarantees a job is processed by exactly one worker. Safe to scale horizontally.                 |
| Worker shuts down with N active jobs                                      | `queue.close()` waits for active jobs to complete (up to a configurable drain timeout: 60s default).    |
| New container image deploys via Watchtower                                | Old container drains; new container starts; in-flight jobs may BullMQ-retry if drain exceeds 60s.       |
| `FOOD_INGEST_DIR` volume not mounted                                      | Worker fails to write extraction files; per-kind handlers error; jobs fail with `WorkdirUnavailable`.   |

## Acceptance Criteria

Inline per theme protocol.

### Image

- [x] `infra/docker/pops-worker-food/Dockerfile` matches the structure above.
- [x] Multi-stage build; final image < 2 GB.
- [x] faster-whisper `distil-large-v3` model baked into the image (downloaded at build time).
- [x] yt-dlp and faster-whisper versions pinned; documented in the Dockerfile + a `versions.json` in `infra/docker/pops-worker-food/`.
- [x] GitHub Actions workflow builds + pushes to `ghcr.io/knoxio/pops-worker-food:main` (matches the `pops-api` / `pops-shell` / `pops-mcp` `:main` + `sha-<short>` tagging convention; the spec text said `:latest`, but POPS uses `:main` for the rolling default-branch image) on changes under `apps/pops-worker-food/**` or `infra/docker/pops-worker-food/**`.

### Compose

- [x] `infra/docker-compose.yml` adds the `worker-food` service per the spec.
- [ ] Cookie volume mount documented; `infra/secrets/.gitignore` excludes the cookie file. <!-- Documented inline in compose; the `infra/secrets/` directory is operator-managed and out of repo (PRD-129 owns the cookie-refresh runbook). -->
- [x] Healthcheck succeeds when worker is running.

### Worker daemon

- [x] `apps/pops-worker-food/src/worker.ts` exists; compiled output runs in the container.
- [x] BullMQ Worker connects, picks up `food.ingest` jobs, dispatches to per-kind handlers via `runIngestJob`.
- [x] Graceful shutdown on SIGTERM drains active jobs (up to 60s).
- [x] Cancellation is checked between pipeline stages.

### Internal API auth

- [x] `POPS_API_INTERNAL_TOKEN` env var consumed; passed in `x-pops-internal-token` header (PRD-125's actual contract; the spec text says `X-Internal-Token`, but the implemented producer reads `x-pops-internal-token` per `apps/pops-api/src/trpc.ts`).
- [x] pops-api validates the token on `food.ingest.workerComplete` mutation; rejects without it.

### Observability

- [x] `/healthz` endpoint at port 9090 returns the documented JSON.
- [x] Every log line includes `sourceId` and `jobId` when in a job context.
- [x] Compose healthcheck succeeds.

### Tests

- [x] Vitest unit tests at `apps/pops-worker-food/src/__tests__/dispatch.test.ts` cover `runIngestJob` dispatching to each handler (handlers mocked).
- [ ] Integration test (Vitest + testcontainers OR docker-compose-based) spins up worker + redis + mock api; submits a job; asserts the worker picks it up and calls the mock api's `workerComplete`. <!-- Deferred to a follow-up — testcontainers infra not yet wired into the monorepo. The unit suite exercises the dispatch round-trip with mocked handlers + a mocked api client. -->
- [x] CI builds the image on PR (image not pushed unless on main).

## Out of Scope

- Per-kind extraction logic — **PRDs 127-132**.
- Producer side (API endpoint, queue config) — **PRD-125**.
- AI usage logging integration — **PRD-133**.
- Instagram cookie refresh procedure — **PRD-129** + `pillars/food/docs/runbooks/instagram-cookie-refresh.md`.
- GPU acceleration for faster-whisper — CPU only in v1 (theme decision).
- Horizontal scaling of workers across machines — operator can scale; PRD doesn't prescribe deployment topology.
- Worker-side dedup or queue manipulation — BullMQ defaults.
- Per-stage retries (e.g. "retry only the vision call") — whole-job retries only in v1.
