# US-02: Annotate Core Procedures

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Not started

## Description

As an external service developer, I access core domain data (entities, jobs, search, settings) via REST so that non-TypeScript services can read and manage shared data.

## Acceptance Criteria

- [ ] `core.entities.list`, `core.entities.get`, `core.entities.create`, `core.entities.update` annotated with OpenAPI metadata
- [ ] `core.jobs.list`, `core.jobs.get`, `core.jobs.retry`, `core.jobs.cancel`, `core.jobs.queueStats` annotated
- [ ] `core.search.query` annotated
- [ ] `core.settings.list`, `core.settings.update` annotated
- [ ] Each annotation includes: HTTP method, path (following `/api/v1/` convention), summary, description
- [ ] All annotated procedures are callable via curl and return correct JSON responses
- [ ] OpenAPI spec includes correct request/response schemas derived from Zod definitions

## Notes

Start with read operations (list, get) — they're the safest to expose and the most useful for external consumers. Write operations (create, update) follow the same pattern but warrant more careful review of input validation.
