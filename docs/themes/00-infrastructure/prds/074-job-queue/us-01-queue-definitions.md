# US-01: Queue Definitions

> PRD: [Job Queue Infrastructure](README.md)
> Status: Partial

## Description

As a backend developer, I import typed queue definitions from a shared module so that every job enqueued has a known data shape and every handler receives typed input.

## Acceptance Criteria

- [x] `src/jobs/queues.ts` exports queue name constants (`SYNC_QUEUE`, `EMBEDDINGS_QUEUE`, `CURATION_QUEUE`, `DEFAULT_QUEUE`)
- [x] `src/jobs/types.ts` defines a discriminated union of job data interfaces per queue (e.g., `SyncJobData`, `EmbeddingJobData`)
- [x] Each job data interface includes a `type` discriminator field for routing within a queue
- [x] `createQueue(name)` factory function returns a typed `Queue<T>` instance connected to the shared Redis client
- [x] Default job options (retry count, backoff, timeout) defined per queue as constants
- [x] All queue names are prefixed with `pops:` to namespace in Redis
- [ ] Unit test verifies queue creation succeeds when Redis is available and throws descriptively when not

## Notes

Keep job data interfaces minimal — include only what the handler needs. Large payloads (file contents, API responses) should be stored in Redis or SQLite and referenced by ID.
