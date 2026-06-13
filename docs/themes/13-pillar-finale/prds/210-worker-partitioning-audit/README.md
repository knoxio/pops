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

| #   | Story                      | Summary                                                | Status                                                                      |
| --- | -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 01  | us-01-audit-jobs           | Catalogue every job + its DB-touch pattern             | Done (inline, see Audit Findings)                                           |
| 02  | us-02-job-by-job-migration | One PR per job: convert in-process writes to SDK calls | Not started (no in-process writes remain to migrate)                        |
| 03  | us-03-bulk-procedures      | Author bulk procedures where needed for perf           | Not started (no batched job currently bottlenecked by per-record SDK calls) |

Story files were never authored — US-01's deliverable is captured inline under **Audit Findings** below; US-02/03 are gated on a job actually needing migration or a bulk path.

## Audit Findings

Status snapshot from the worker tree as of this audit. Audit only — no code changes.

### Worker inventory

| Worker             | Pillar(s) touched | Queue / job kinds                                                                                                      | DB access pattern                                                                                                                                                                  | Partitioning verdict        |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `pops-worker-food` | food (only)       | `food.ingest` queue: `web-url`, `screenshot`, `text`, `instagram*`, `web-llm-*` handlers (see `src/handlers/index.ts`) | tRPC HTTP only — `client.food.ingest.workerComplete.mutate(...)` against pops-api with `x-pops-internal-token` (PRD-125). No drizzle, no `@pops/*-db` workspace imports in `src/`. | Single-pillar, SDK-correct. |

`apps/pops-worker-*` glob returns exactly one directory; the PRD's `bullmq:plex-sync` (media), `bullmq:ai-categorize` (finance + core/aiUsage), and `*arr ingest` jobs referenced in the parent epic do not exist in code — no worker writes those tables today.

### Cross-pillar offenders

None. `pops-worker-food`'s runtime `package.json` dependencies are scoped to `@pops/food-contracts`; the only other workspace import is a `devDependencies` reference to `@pops/app-food-db` consumed in `src/__tests__/*` to reuse `parseRecipeDsl` for fixture parsing. That is a same-pillar test-only dep, not a cross-pillar runtime DB write.

### Implications for ADR-029 / Epic 08b

- The "convert in-process pillar-DB writes to SDK calls" workstream this PRD anticipated has nothing to convert in `pops-worker-food`. The worker was authored against the PRD-125/126 callback contract from the start.
- Future workers (plex-sync, ai-categorize, \*arr ingest) are still hypothetical. When they are scaffolded, this PRD's per-job audit rubric still applies; until then it has no active migration backlog.
- Bulk pillar procedures (US-03) are only justified by an observed throughput bottleneck — none today.

### Re-audit triggers

Reopen this PRD when any of the following lands:

- A new `apps/pops-worker-*` directory.
- A `package.json` dependency on `@pops/*-db` (any pillar) inside an existing worker's runtime (non-`devDependencies`) section.
- A handler that imports `drizzle-orm` or a `db` client directly under `apps/pops-worker-*/src/` (excluding tests).

## Out of Scope

- BullMQ infrastructure changes; just call-site migration.
- Cross-pillar transactional guarantees (out of scope per ADR-029).
- Worker autoscaling.
