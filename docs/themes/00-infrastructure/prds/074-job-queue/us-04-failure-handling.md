# US-04: Failure Handling

> PRD: [Job Queue Infrastructure](README.md)
> Status: Done

## Description

As a platform operator, I trust that failed jobs are retried with backoff and permanently failed jobs are preserved for inspection so that no work is silently lost.

## Acceptance Criteria

- [x] Each queue defines retry count and exponential backoff strategy in its default job options
- [x] Jobs that exhaust all retries move to a dead-letter queue (`pops:dead-letter`)
- [x] Dead-letter jobs retain full job data, error stack, and attempt history
- [x] Stalled job detection enabled (BullMQ `stalledInterval: 30000`) — stalled jobs are retried
- [x] Job failure events are logged at `error` level with job ID, queue, attempt number, and error message
- [x] `core.jobs.queueStats` includes dead-letter queue counts
- [x] Dead-letter jobs can be retried via `core.jobs.retry` (moves back to original queue)
- [x] Integration test: a deliberately failing job exhausts retries and lands in dead-letter

## Notes

BullMQ handles most of this natively. The work here is configuration and wiring events to logging, not custom retry logic.
