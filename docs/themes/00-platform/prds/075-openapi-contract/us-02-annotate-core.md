# US-02: Annotate Core Procedures

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Done

## Description

As an external service developer, I access core domain data (entities, jobs, search, settings) via REST so that non-TypeScript services can read and manage shared data.

## Acceptance Criteria

- [x] `core.entities.list`, `core.entities.get`, `core.entities.create`, `core.entities.update` annotated with OpenAPI metadata
- [x] `core.jobs.list`, `core.jobs.get`, `core.jobs.retry`, `core.jobs.cancel`, `core.jobs.drain`, `core.jobs.queueStats`, `core.jobs.schedulers` annotated
- [x] `core.search.query` annotated
- [x] `core.settings.list`, `core.settings.get`, `core.settings.set` annotated
- [x] Each annotation includes: HTTP method, path (following `/api/v1/` convention), summary, description
- [x] All annotated procedures are callable via curl and return correct JSON responses
- [x] OpenAPI spec includes correct request/response schemas derived from Zod definitions

## Notes

Start with read operations (list, get) — they're the safest to expose and the most useful for external consumers. Write operations (create, update) follow the same pattern but warrant more careful review of input validation.
