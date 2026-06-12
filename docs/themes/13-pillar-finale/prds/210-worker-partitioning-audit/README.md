# PRD-210: Worker partitioning audit

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)

## Overview

`pops-worker` stays as a single container (per ADR-029). But its DB access changes: instead of `@pops/finance-db`, `@pops/media-db`, etc. workspace imports, it calls pillars via the SDK over HTTP. This PRD audits every job's data access pattern and updates them.

## Data Model

No data.

## API Surface

Per-job audit. Examples:

- `bullmq:plex-sync` → calls `pillar('media').plex.sync(...)` instead of in-process drizzle writes.
- `bullmq:ai-categorize` → calls `pillar('finance').transactions.update(...)` + `pillar('core').aiUsage.log.create(...)`.

## Business Rules

- **One job converted per PR.** Surfaces issues per-job rather than one massive change.
- **Each job's DB-write becomes a typed SDK call.** Type safety preserved via the contract.
- **Some jobs may need new pillar procedures** (e.g. a "bulk insert" procedure if the existing per-record SDK calls are too slow). Authored alongside the audit.

## Edge Cases

| Case                                                                         | Behaviour                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| High-throughput job that crosses pillars (e.g. Plex sync writes 1000 movies) | Add bulk procedure; call once per batch instead of N times.                                       |
| Job currently writes to multiple pillars in a transaction                    | Cannot preserve cross-pillar atomicity over HTTP; saga / compensation pattern documented per-job. |

## User Stories

| #   | Story                                                       | Summary                                                |
| --- | ----------------------------------------------------------- | ------------------------------------------------------ |
| 01  | [us-01-audit-jobs](us-01-audit-jobs.md)                     | Catalogue every job + its DB-touch pattern             |
| 02  | [us-02-job-by-job-migration](us-02-job-by-job-migration.md) | One PR per job: convert in-process writes to SDK calls |
| 03  | [us-03-bulk-procedures](us-03-bulk-procedures.md)           | Author bulk procedures where needed for perf           |

## Out of Scope

- BullMQ infrastructure changes; just call-site migration.
- Cross-pillar transactional guarantees (out of scope per ADR-029).
- Worker autoscaling.
