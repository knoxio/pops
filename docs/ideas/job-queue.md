# Idea: Central Job-Queue Management & Repeatable Schedulers

Spun out of the Job Queue Infrastructure PRD
([docs/themes/platform/prds/job-queue.md](../themes/platform/prds/job-queue.md)).
The per-pillar BullMQ producer/consumer model is built and shipped. The pieces
below were specified in the original PRD but **do not exist in code** — they
assume a central job service the federated architecture deliberately dropped.

## What's missing

### 1. Central job-management API

A cross-pillar surface to `list` / `get` / `retry` / `cancel` / `drain` /
`queueStats` over jobs in every queue. Today there is no such router in any
pillar — jobs are only observable through Redis directly. In the federated
model each pillar owns its queues, so a "central" view would have to be either:

- the **orchestrator** (`:3009`) aggregating per-pillar job endpoints each
  pillar would have to expose, or
- a thin per-pillar `jobs` REST surface (`GET /jobs`, `GET /jobs/:id`,
  `POST /jobs/:id/retry`, `POST /jobs/:id/cancel`, `POST /jobs/drain`,
  `GET /jobs/stats`) added to each producing pillar's ts-rest contract, with a
  shared SDK helper wrapping the BullMQ `Queue.getJobs` / `getJobCounts` /
  `job.retry` / `job.remove` calls.

The latter fits the architecture better: keep ownership in the pillar, let the
orchestrator or shell fan out. No central authentication-wrapped `core.jobs.*`
procedure should be reintroduced.

### 2. Shared `pops-default` general-purpose queue

The original spec defined a `pops-default` (concurrency 3) catch-all queue. No
pillar declares it. If a general-purpose queue is ever needed it should belong
to a specific pillar (or the orchestrator), not a shared monolith namespace.

### 3. Dedicated dead-letter queue

The spec called for a `pops-dead-letter` queue that exhausted-retry jobs move
into, retaining full data + error stack + attempt history, retryable back to
the origin queue, and counted in `queueStats`. Not built. Current behaviour:
failed jobs are retained in-queue via `removeOnFail: { count: 1000 }` and
observed through Redis; there is no separate dead-letter queue, no automatic
move on retry-exhaustion, and no API to inspect or replay them.

### 4. Repeatable-job schedulers (replace `setInterval`)

The spec wanted BullMQ repeatable jobs to replace interval-based schedulers so
schedule state survives restarts. In reality:

- **ai-alerts** and **ai-observability** schedulers run as **`setInterval`**
  loops in the ai pillar, env-gated off by default
  (`AI_ALERTS_SCHEDULER_ENABLED`), each calling its evaluator directly against
  the pillar's own DB. Both source files carry a TODO to move to a durable
  cron-scheduled job once the pillar has a job runner.
- There is no `repeat.every` / cron registration anywhere.

A durable scheduler (BullMQ repeatable jobs, or a pillar-owned cron primitive)
would let these survive restarts and report progress/history through the
hypothetical jobs API above.

### 5. Plex sync as a repeatable job

The original us-05 migrated Plex sync from in-memory tracking to BullMQ
repeatable jobs. The current **media** pillar runs sync **in-process**:
`startSyncJob` fires `void runSyncJob(...)` and persists the outcome to
`sync_job_results`. The media pillar has **no Redis/BullMQ dependency at all**.
`plexSyncDiscoverWatches` and the rotation domain are explicitly deferred.

To realise the original intent, media would need to:

- add a `pops-sync` (or `media.sync`) queue contract + producer + worker
  container (same image, worker entrypoint),
- register the sync interval (read from settings) as a BullMQ repeatable job,
  re-registering when the interval setting changes (remove old repeat key,
  add new),
- report progress via the BullMQ progress API,
- write completed results to `sync_job_results` from a `completed` handler,
- migrate the rotation scheduler the same way.

This is a sizeable migration and only worth doing if sync history/observability
or restart-durable scheduling becomes a real requirement; the in-process
dispatcher is adequate today.

## Why deferred

The federated architecture intentionally has no central job service and most
pillars have no Redis dependency. Adding a cross-cutting management API, a
shared default/dead-letter queue, and durable schedulers is real work that only
pays off once there are enough background jobs to operate at scale. Per-pillar
queues + Redis-level observability cover current needs.
