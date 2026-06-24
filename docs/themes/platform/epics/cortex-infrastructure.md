# Epic: Cortex Infrastructure

> Theme: [Platform](../README.md)

## Scope

The shared runtime infrastructure the application layer depends on: a Redis container for job queuing and caching, a BullMQ job queue for durable background processing, each pillar's OpenAPI contract as the polyglot wire surface for non-TypeScript consumers, and sqlite-vec for vector storage and semantic search. After this epic, the platform supports long-running background jobs, semantic queries over stored content, and integration by any consumer through a generated API spec.

## PRDs

| PRD                                                               | Summary                                                                                          | Status |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| [Redis Container & Connection](../prds/redis-container/README.md) | Redis 7 in the Docker stack, connection module, dev setup                                        | Done   |
| [Job Queue Infrastructure](../prds/job-queue/README.md)           | BullMQ queues, typed workers, job management API, failure handling                               | Done   |
| [OpenAPI Pillar Contract](../prds/openapi-contract/README.md)     | Per-pillar OpenAPI 3.0.x projection of each REST contract, served at `GET /openapi`, drift-gated | Done   |
| [Vector Storage](../prds/vector-storage/README.md)                | sqlite-vec extension, embedding schema, similarity search service, embedding generation pipeline | Done   |

Redis must complete before the Job Queue — BullMQ requires a Redis connection. OpenAPI and Vector Storage are independent of each other and of the Job Queue, but Vector Storage benefits from it (embedding generation runs as background jobs).

## Dependencies

- **Requires:** Database Operations (sqlite-vec uses the same per-pillar migration system); the Docker runtime + networks provided by the deployer
- **Unlocks:** the cerebrum pillar, the AI layer, non-TypeScript consumer integration, native mobile app API access

## Out of Scope

- Domain logic of the consumers (cerebrum, AI orchestration) — separate themes
- Specific embedding model selection (the owning pillar decides this)
- Redis Sentinel or clustering (single-node is sufficient)
