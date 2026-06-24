# Epic: API Server

> Theme: [Foundation](../README.md)

## Scope

Establish the per-pillar REST server pattern: each pillar serves a ts-rest + zod contract (axum + OpenAPI for Rust pillars) over its own SQLite database, exports a `./manifest`, and self-registers with the `registry` pillar on boot. Shared middleware handles auth, rate limiting, and error handling. There is no shared API monolith — the contract is the unit of composition.

## PRDs

| PRD        | Summary                                                                      | Status |
| ---------- | ---------------------------------------------------------------------------- | ------ |
| API Server | Domain module structure, router composition, middleware, module import rules | Done   |

## Dependencies

- **Requires:** [Project Bootstrap](project-bootstrap.md) (monorepo toolchain)
- **Unlocks:** Every pillar (they need the REST server pattern to stand up a contract)

## Out of Scope

- Domain-specific endpoints (each pillar owns its own contract)
- Database schema ([DB Schema Patterns](db-schema-patterns.md))
- Deployment configuration (Platform theme)
