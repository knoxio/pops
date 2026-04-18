# US-03: Job Management API

> PRD: [Job Queue Infrastructure](README.md)
> Status: Partial

## Description

As a user, I query and manage background jobs via the API so that I can see what's running, retry failures, and cancel stuck jobs.

## Acceptance Criteria

- [x] `src/modules/core/jobs/router.ts` defines tRPC procedures: `list`, `get`, `retry`, `cancel`, `drain`, `queueStats`
- [x] `list` supports filtering by queue name and job status (waiting, active, completed, failed, delayed)
- [x] `list` returns paginated results with `total` count
- [x] `get` returns full job details including data, progress, attempts, failure reason, and timestamps
- [x] `retry` re-enqueues a failed job with reset attempt count
- [x] `cancel` removes a waiting job or marks an active job for cancellation
- [x] `drain` removes all waiting jobs from a specific queue (requires confirmation param)
- [x] `queueStats` returns counts per status for each queue
- [x] All procedures are protected (require authenticated user)
- [ ] Unit tests verify each procedure against a real Redis instance (in-memory or test container)

## Notes

This is the API layer only — no UI in this user story. The app-ai package may add a job dashboard page in a future PRD.
