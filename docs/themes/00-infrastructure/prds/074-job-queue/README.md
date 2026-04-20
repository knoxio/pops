# PRD-074: Job Queue Infrastructure

> Epic: [08 — Cortex Infrastructure](../../epics/08-cortex-infrastructure.md)
> Status: Done

## Overview

Replace in-memory job tracking with BullMQ-backed durable job queues. Define typed queue interfaces, a worker entry point separate from the API server, job management tRPC procedures, and failure handling with dead-letter queues. Migrate the existing Plex sync scheduler to BullMQ repeatable jobs as a proof-of-concept.

## Data Model

No new SQLite tables. Job state lives in Redis (managed by BullMQ). The existing `sync_job_results` table is retained for completed job history but is written by BullMQ event handlers rather than in-memory tracking.

### Queue Definitions

| Queue             | Purpose                                | Concurrency | Retry | Priority |
| ----------------- | -------------------------------------- | ----------- | ----- | -------- |
| `pops-sync`       | Media sync jobs (Plex, Radarr, Sonarr) | 1           | 3     | Normal   |
| `pops-embeddings` | Vector embedding generation            | 2           | 3     | Low      |
| `pops-curation`   | Content consolidation, deduplication   | 1           | 2     | Low      |
| `pops-default`    | General-purpose jobs                   | 3           | 3     | Normal   |

## API Surface

| Procedure              | Input                            | Output                           | Notes                          |
| ---------------------- | -------------------------------- | -------------------------------- | ------------------------------ |
| `core.jobs.list`       | queue?, status?, limit?, offset? | `{ jobs: Job[], total: number }` | Lists jobs across queues       |
| `core.jobs.get`        | jobId, queue                     | `{ job: Job }`                   | Full job details with logs     |
| `core.jobs.retry`      | jobId, queue                     | `{ success: boolean }`           | Re-enqueue a failed job        |
| `core.jobs.cancel`     | jobId, queue                     | `{ success: boolean }`           | Cancel a waiting or active job |
| `core.jobs.drain`      | queue                            | `{ drained: number }`            | Remove all waiting jobs        |
| `core.jobs.queueStats` | —                                | `{ queues: QueueStats[] }`       | Counts by status per queue     |

## Business Rules

- Workers run as a separate process entry point (`src/worker.ts`) — not inside the API server event loop
- Workers share the same database connection module as the API (Drizzle, SQLite)
- Each job type is defined as a TypeScript interface — job data is typed at enqueue and dequeue
- Failed jobs move to a dead-letter queue after exhausting retries
- BullMQ repeatable jobs replace `setInterval`-based schedulers (Plex sync, rotation)
- Job progress is reported via BullMQ's built-in progress API, not custom polling
- The worker process has the same graceful shutdown handling as the API server

## Edge Cases

| Case                                  | Behaviour                                                             |
| ------------------------------------- | --------------------------------------------------------------------- |
| Worker crashes mid-job                | BullMQ marks job as stalled after `stalledInterval`, retries it       |
| Redis unavailable when enqueueing     | Enqueue throws; caller handles (API returns 503 or logs warning)      |
| Duplicate repeatable job registration | BullMQ deduplicates by repeat key — no duplicate jobs                 |
| Job exceeds timeout                   | BullMQ marks as failed after `jobTimeout`, moves to retry/dead-letter |
| Worker starts before Redis is ready   | BullMQ Worker auto-retries Redis connection (ioredis reconnect)       |
| Multiple worker instances             | Safe — BullMQ distributes jobs, each job processed exactly once       |

## User Stories

| #   | Story                                                   | Summary                                                                          | Status | Parallelisable   |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-queue-definitions](us-01-queue-definitions.md)   | Define typed queue interfaces, job data schemas, shared constants                | Done   | No (first)       |
| 02  | [us-02-worker-entry](us-02-worker-entry.md)             | Separate worker process with job handlers, graceful shutdown, Docker integration | Done   | Blocked by us-01 |
| 03  | [us-03-job-management-api](us-03-job-management-api.md) | tRPC procedures for listing, retrying, cancelling, draining jobs                 | Done   | Blocked by us-01 |
| 04  | [us-04-failure-handling](us-04-failure-handling.md)     | Dead-letter queue, retry policies, stalled job detection, error logging          | Done   | Blocked by us-02 |
| 05  | [us-05-migrate-sync-jobs](us-05-migrate-sync-jobs.md)   | Migrate Plex sync scheduler from in-memory to BullMQ repeatable jobs             | Done   | Blocked by us-02 |

US-03 can run in parallel with US-02 (API reads from queues, worker writes — independent entry points). US-04 and US-05 require the worker to be functional.

## Verification

- A job enqueued via `core.jobs` API appears in the queue and is processed by the worker
- A failing job retries the configured number of times, then moves to dead-letter
- Plex sync runs as a BullMQ repeatable job with the same schedule as the current `setInterval` implementation
- Worker survives Redis restart (reconnects and resumes processing)
- `core.jobs.queueStats` returns accurate counts across all queues
- Worker process shuts down gracefully (finishes active job, then exits)
- In-memory `sync-job-manager.ts` is deleted after migration

## Out of Scope

- Job management UI (future app-ai enhancement)
- Cortex-specific job types (defined in the Cortex theme)
- Rate limiting per queue (add when needed)
- Multi-node worker deployment (single worker process is sufficient)

## Drift Check

last checked: 2026-04-17
