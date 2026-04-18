# Epic 08: Cortex Infrastructure

> Theme: [Infrastructure](../README.md)

## Scope

Add the foundational infrastructure that the Cortex service (and other future services) need: Redis for job queuing and caching, BullMQ for durable job processing, OpenAPI as a secondary API contract for non-TypeScript consumers, and sqlite-vec for vector storage and semantic search. After this epic, the platform supports long-running background jobs, semantic queries over stored content, and external service integration via a generated API spec.

## PRDs

| #   | PRD                                                                   | Summary                                                                                          | Status |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| 073 | [Redis Container & Connection](../prds/073-redis-container/README.md) | Add Redis 7 to Docker stack, connection module in pops-api, Ansible provisioning, dev setup      | Done   |
| 074 | [Job Queue Infrastructure](../prds/074-job-queue/README.md)           | BullMQ queues, typed workers, job management API, failure handling, migration of in-memory jobs  | Done   |
| 075 | [OpenAPI Secondary Contract](../prds/075-openapi-contract/README.md)  | trpc-openapi annotations on domain CRUD procedures, spec generation, Swagger UI, CI validation   | Done   |
| 076 | [Vector Storage](../prds/076-vector-storage/README.md)                | sqlite-vec extension, embedding schema, similarity search service, embedding generation pipeline | Done   |

PRD-073 (Redis) must complete before PRD-074 (Job Queue) — BullMQ requires a Redis connection. PRD-075 (OpenAPI) and PRD-076 (Vector Storage) are independent of each other and of PRD-074, but PRD-076 benefits from PRD-074 (embedding generation runs as background jobs).

## Dependencies

- **Requires:** Epic 01 (Docker runtime), Epic 07 (database operations — sqlite-vec uses the same migration system)
- **Unlocks:** Cortex service (Theme 06), AI Layer (Phase 3), non-TypeScript service integration, native mobile app API access

## Out of Scope

- The Cortex service itself (separate theme)
- AI overlay or chat interface (Phase 3 / PRD-054)
- Specific embedding model selection (Cortex decides this)
- Redis Sentinel or clustering (single-node is sufficient)
- Full REST API migration away from tRPC
