# US-03: Job Management API

> PRD: [Job Queue Infrastructure](README.md)
> Status: Not started

## Description

As a user, I query and manage background jobs via the API so that I can see what's running, retry failures, and cancel stuck jobs.

## Acceptance Criteria

- [ ] `src/modules/core/jobs/router.ts` defines tRPC procedures: `list`, `get`, `retry`, `cancel`, `drain`, `queueStats`
- [ ] `list` supports filtering by queue name and job status (waiting, active, completed, failed, delayed)
- [ ] `list` returns paginated results with `total` count
- [ ] `get` returns full job details including data, progress, attempts, failure reason, and timestamps
- [ ] `retry` re-enqueues a failed job with reset attempt count
- [ ] `cancel` removes a waiting job or marks an active job for cancellation
- [ ] `drain` removes all waiting jobs from a specific queue (requires confirmation param)
- [ ] `queueStats` returns counts per status for each queue
- [ ] All procedures are protected (require authenticated user)
- [ ] Unit tests verify each procedure against a real Redis instance (in-memory or test container)

## Notes

This is the API layer only — no UI in this user story. The app-ai package may add a job dashboard page in a future PRD.
