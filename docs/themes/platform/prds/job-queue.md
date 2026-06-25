# PRD: Job Queue Infrastructure

> Theme: [Platform](../README.md)
> Status: Done (per-pillar queues shipped; central management surface is an [idea](../../../ideas/job-queue.md))

## Overview

Pillars that need durable background work run their own BullMQ queues backed by
the shared Redis container. A pillar that produces jobs declares a typed queue
contract, enqueues from its REST handlers, and ships a **separate worker
container** — the same image as its API server, started with a different
entrypoint command. There is no central job-queue service: each pillar owns its
queues, its handlers, and its result persistence. Redis is shared
infrastructure ([Redis Container](redis-container.md)); BullMQ semantics
(retries, backoff, stalled-job recovery, exactly-once delivery) are reused
rather than reimplemented.

Two pillars run queues today:

- **food** — the `food.ingest` queue feeds recipe extraction pipelines.
- **cerebrum** — the `pops-embeddings` and `pops-curation` queues feed vector
  indexing and engram enrichment.

See [ADR-026](../../../architecture/adr-026-pillar-architecture.md): "Workers,
jobs, cron tasks owned by a pillar live in that pillar's `-api` package. A
pillar's worker container is the same image as its api container, just running a
different entrypoint."

## Architecture

```
┌──────────────┐   enqueue    ┌───────────┐   drain    ┌──────────────────┐
│  <pillar>-api │ ───────────▶ │   Redis   │ ─────────▶ │ <pillar>-worker   │
│  (producer)   │              │  (BullMQ) │            │ (consumer, same   │
│               │ ◀─────────── │           │ ◀───────── │  image, diff cmd) │
└──────┬───────┘  result POST  └───────────┘  job state └────────┬─────────┘
       │  REST (internal-token)                                  │
       ▼                                                         ▼
   <pillar>.db (SQLite)                              <pillar>.db / peer REST
```

- The **producer** is the pillar's REST server. It owns a lazy queue singleton
  and enqueues typed jobs from request handlers.
- The **consumer** is a standalone process (`node dist/worker/...`) shipped as a
  second container built from the **same pillar image**. Only the command
  differs. CI and publishing stay single-image per pillar.
- Job results flow back to the producing pillar's SQLite either directly (the
  worker opens the pillar DB, as cerebrum does) or via an internal-token-gated
  REST callback (as food does).

## Data Model

No queue-specific SQLite tables. Live job state (waiting / active / delayed /
completed / failed) is held in Redis by BullMQ. Pillars persist only the
**terminal results they care about** into their own SQLite.

| Store                            | Owner    | Holds                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------- |
| Redis (BullMQ keyspace)          | shared   | All in-flight job state, retry counters, repeat keys              |
| `sync_job_results` table         | registry | Terminal state of the five Plex sync job types (history view)     |
| `<pillar>.db` per-handler tables | pillar   | Extraction drafts, embeddings, enrichment output (handler's call) |

`sync_job_results` lives in the **registry** pillar (formerly `core`), next to
`pillarRegistry`. Only the five `plexSync*` job types are mirrored there; every
other queue's jobs are observed via Redis only and never reach a table.
`PERSISTED_SYNC_TYPES` is the closed allow-list the writer filters on.

## Queue Contract

Each producing pillar exports a queue contract — a queue-name constant plus the
discriminated-union job-data and job-result types — with **no runtime
dependencies**. The contract is the only seam where producer and consumer (in
different containers) agree on shape.

### food — `food.ingest`

| Field                      | Shape                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Queue name                 | `food.ingest`                                                                                                                      |
| Job data (union by `kind`) | `url-web` / `url-instagram` (`sourceId`, `url`); `text` (`sourceId`, `body`); `screenshot` (`sourceId`, `mimeType`, `contentPath`) |
| Job result (union by `ok`) | success: `{ ok: true; dsl; meta; partialReason? }`; failure: `{ ok: false; errorCode; errorMessage; meta; retryAfterSec? }`        |
| Result envelope            | `IngestMeta` — `extractor_version`, per-stage `stages` record, optional duration/cost/raw-output                                   |

Large payloads stay out of Redis: screenshot bytes are written to
`${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` before enqueue; the job carries
only `contentPath`.

### cerebrum — `pops-embeddings` and `pops-curation`

| Queue             | Job data                               | Consumer does                         |
| ----------------- | -------------------------------------- | ------------------------------------- |
| `pops-embeddings` | `{ sourceType; sourceId; content? }`   | Generates dense vectors; indexes them |
| `pops-curation`   | `{ type: 'classifyEngram'; engramId }` | Classify / extract / scope enrichment |

## Shared Conventions

Every pillar queue applies the same defaults (duplicated per pillar — there is
no shared SDK helper today; the convention is the contract):

| Concern             | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Retry attempts      | `3`                                                                      |
| Backoff             | `exponential`, base delay `5000ms`                                       |
| Retention           | `removeOnComplete` / `removeOnFail` = `{ count: 1000 }`                  |
| Redis client option | `maxRetriesPerRequest: null` (mandatory — BullMQ uses blocking cmds)     |
| Redis resolution    | `REDIS_URL`, else `redis://${REDIS_HOST}:${REDIS_PORT ?? 6379}`          |
| No-Redis behaviour  | producer singleton returns `null`; handler maps to `503`                 |
| Stalled detection   | `stalledInterval: 30000` (cerebrum worker)                               |
| Concurrency / rate  | per-pillar (food: `FOOD_WORKER_CONCURRENCY`, `FOOD_INGEST_RATE_PER_MIN`) |

`maxRetriesPerRequest: null` is non-negotiable: BullMQ uses blocking Redis
commands and ioredis's default retry-on-timeout fights them, causing spurious
disconnects.

## Business Rules

- A pillar's worker is a **separate process**, never inside the API event loop.
- The worker container is the **same image** as the API container — only the
  entrypoint command differs (`node dist/worker/worker.js`,
  `node dist/worker/index.js`). One build, one publish per pillar.
- Job data is **typed at enqueue and dequeue** via the pillar's queue contract;
  a discriminator field (`kind` / `type`) routes within a queue.
- The producer queue is a **lazy singleton** that returns `null` when Redis is
  unconfigured, so tests and dev runs without Redis don't fail at module load.
- A worker whose Redis is unconfigured **logs and exits cleanly** (cerebrum) or
  the producing handler returns `503` (food) — never a crash.
- Workers reuse the same DB module / env / logger config as their pillar's API.
- **Graceful shutdown**: on SIGTERM/SIGINT the worker stops taking new jobs,
  drains active jobs up to a timeout (food: 60s default, configurable;
  cerebrum: awaits `worker.close()`), closes Redis, closes the DB handle, exits.
- A worker exposes a health endpoint (food: HTTP `/healthz` on a configurable
  port, reporting queue-running state and active-job count).
- Per-job timeout is enforced **in-band** (food races the handler against a
  timer) because BullMQ has no native per-job timeout — `stalledInterval` only
  detects a lost lock after the fact.
- Cancellation is **cooperative**: cancelling deletes the BullMQ row
  (`job.remove()`); a running handler polls `job.getState()` between stages and
  short-circuits once the state reads `'unknown'`.
- Result delivery: food POSTs results back to the pillar's REST
  `worker-complete` endpoint, internal-token-gated via `x-pops-internal-token`;
  cerebrum's worker writes directly to its own `cerebrum.db`.

## Edge Cases

| Case                               | Behaviour                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Worker crashes mid-job             | BullMQ marks the job stalled after `stalledInterval`, then retries it     |
| Redis unconfigured (producer)      | Queue singleton returns `null`; handler returns `503`                     |
| Redis unconfigured (consumer)      | Worker logs and exits cleanly; that background work simply doesn't run    |
| Result callback fails (food)       | Worker rethrows so BullMQ retries the whole job                           |
| Job exceeds in-band timeout (food) | Handler resolves a `TimedOut` failure result; reported back, then retried |
| Cancel during processing           | `job.remove()` deletes the row; handler's next state check short-circuits |
| Multiple worker instances          | Safe — BullMQ distributes jobs, each processed exactly once               |
| Worker starts before Redis ready   | ioredis reconnect (`maxRetriesPerRequest: null`) — worker waits, no crash |

## Acceptance Criteria

### Queue contracts (per producing pillar)

- [x] A pillar that produces jobs exports a queue contract module with the
      queue-name constant and discriminated-union job-data + job-result types,
      with no runtime dependencies (food: `src/contract/queue/index.ts`;
      cerebrum: per-domain `queue.ts` declaring `*_QUEUE_NAME` + job-data type)
- [x] Each job-data type carries a discriminator field (`kind` for food,
      `type` for cerebrum curation) used to route within a queue
- [x] Default job options (attempts 3, exponential 5s backoff, retention 1000)
      are defined per queue as a shared `DefaultJobOptions` constant
- [x] The producer is a lazy `Queue<T>` singleton connected to a Redis client
      built from `REDIS_URL` / `REDIS_HOST`+`REDIS_PORT`
- [x] The producer singleton returns `null` when Redis is unconfigured and is
      closed on graceful shutdown

### Worker entry point (per producing pillar)

- [x] A standalone worker entry point (`src/worker/worker.ts` for food,
      `src/worker/index.ts` for cerebrum) connects to Redis, registers a BullMQ
      `Worker` per queue, and processes jobs
- [x] Handler dispatch uses the job-data discriminator to route to the correct
      per-kind function
- [x] The worker reuses the pillar's DB module / env / logger
- [x] Graceful shutdown on SIGTERM/SIGINT: stop new jobs, drain active jobs up
      to a timeout, close Redis, close DB, exit
- [x] A worker container is defined in `infra/docker-compose.yml` using the same
      pillar image with a worker command, on the backend network, depending on
      Redis with `condition: service_healthy`
- [x] The worker exposes a health endpoint (food: `/healthz` reporting
      queue-running + active-job count)

### Failure handling

- [x] Each queue defines a retry count and exponential backoff in its default
      job options
- [x] Stalled-job detection is enabled (`stalledInterval: 30000`) so stalled
      jobs are retried (cerebrum worker)
- [x] Job-failure events are logged at error level with job id, queue, and error
- [x] A per-job timeout produces a deterministic failure path rather than a
      leaked long-running stage (food's in-band `Promise.race`)

### Result persistence

- [x] The five Plex sync job types persist their terminal state to the
      `sync_job_results` table (owned by the registry pillar) for the sync
      history view; `PERSISTED_SYNC_TYPES` is the closed allow-list
- [x] All other queues' jobs are observed via Redis only and write only the
      handler-specific output their pillar cares about

## Out of Scope

- A central job-management API (`list` / `get` / `retry` / `cancel` / `drain` /
  `queueStats`), a shared `pops-default` general-purpose queue, a dedicated
  `pops-dead-letter` queue, and BullMQ repeatable-job schedulers — **none of
  these exist**; they are captured as [an idea](../../../ideas/job-queue.md).
- A job-management UI.
- Rate limiting beyond the per-queue limiter food already configures.
- Multi-node worker deployment / Redis clustering (single node is sufficient).

## Drift Check

last checked: 2026-06-24
