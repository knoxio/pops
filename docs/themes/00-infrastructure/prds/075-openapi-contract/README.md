# PRD-075: OpenAPI Secondary Contract

> Epic: [08 — Cortex Infrastructure](../../epics/08-cortex-infrastructure.md)
> Status: Done

## Overview

Add OpenAPI 3.1 as a secondary API contract alongside tRPC. Use trpc-openapi to annotate existing tRPC routers with HTTP method, path, and description metadata. Generate the spec from live router definitions so it cannot drift from implementation. Serve Swagger UI at `/api/docs` for exploration and provide the raw spec at `/api/openapi.json` for client generation.

## API Surface

### New Endpoints

| Endpoint            | Method | Purpose                           |
| ------------------- | ------ | --------------------------------- |
| `/api/openapi.json` | GET    | Raw OpenAPI 3.1 spec (JSON)       |
| `/api/docs`         | GET    | Swagger UI for exploring the spec |

### Annotation Convention

Not every tRPC procedure gets an OpenAPI annotation. The rule:

| Procedure Type                                  | Annotate? | Reason                                         |
| ----------------------------------------------- | --------- | ---------------------------------------------- |
| Domain CRUD (list, get, create, update, delete) | Yes       | Core data access needed by external consumers  |
| Search and query                                | Yes       | Discovery and retrieval across domains         |
| Import/batch operations                         | No        | Complex multi-step, UI-specific                |
| UI helpers (suggestions, form validation)       | No        | Frontend-specific, not useful externally       |
| Job management                                  | Yes       | Cortex worker and monitoring tools need access |

### Path Convention

Annotated procedures map to REST-style paths:

```
core.entities.list      → GET    /api/v1/entities
core.entities.get       → GET    /api/v1/entities/:id
finance.transactions.list → GET  /api/v1/finance/transactions
media.movies.get        → GET    /api/v1/media/movies/:id
core.jobs.list          → GET    /api/v1/jobs
```

## Business Rules

- tRPC remains the primary API for the React frontend — no changes to existing frontend code
- OpenAPI annotations use `.meta()` on tRPC procedures — no separate route definitions
- The spec is generated at startup from live router definitions, not from a static file
- OpenAPI paths use `/api/v1/` prefix for versioning
- Zod input schemas are converted to JSON Schema automatically by trpc-openapi
- Authentication for OpenAPI endpoints uses the same Cloudflare Access JWT as tRPC
- CI validates that all annotated procedures have complete metadata (path, method, description)

## Edge Cases

| Case                                        | Behaviour                                                            |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Procedure annotated without description     | CI lint step fails — description is required for annotated procs     |
| Zod schema uses `.transform()` or `.pipe()` | trpc-openapi may not convert cleanly — lint warns, developer adjusts |
| Two procedures map to same path             | Startup fails with clear error — paths must be unique                |
| Non-annotated procedure called via REST     | Returns 404 — only annotated procedures are exposed                  |

## User Stories

| #   | Story                                                   | Summary                                                                 | Status  | Parallelisable   |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------- | ---------------- |
| 01  | [us-01-trpc-openapi-setup](us-01-trpc-openapi-setup.md) | Install trpc-openapi, configure Express middleware, serve spec and UI   | Done    | No (first)       |
| 02  | [us-02-annotate-core](us-02-annotate-core.md)           | Annotate core domain CRUD procedures (entities, jobs, search, settings) | Partial | Blocked by us-01 |
| 03  | [us-03-annotate-domains](us-03-annotate-domains.md)     | Annotate finance, media, inventory domain CRUD procedures               | Done    | Blocked by us-01 |
| 04  | [us-04-ci-validation](us-04-ci-validation.md)           | CI step validates OpenAPI annotations are complete and spec is valid    | Done    | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01. US-04 can start after US-01 (validates whatever annotations exist).

## Verification

- `/api/openapi.json` returns a valid OpenAPI 3.1 spec
- `/api/docs` renders Swagger UI with all annotated procedures
- A non-TypeScript client (e.g., `curl`) can call annotated endpoints and get correct responses
- CI fails if an annotated procedure is missing its description or path
- The generated spec validates against the OpenAPI 3.1 specification
- Frontend code is unchanged and continues to use tRPC

## Out of Scope

- Client SDK generation (consumers generate their own via openapi-typescript or similar)
- API rate limiting per consumer (single-user system)
- API key authentication (Cloudflare Access handles auth)
- GraphQL or gRPC alternatives
- Versioning beyond `/api/v1/` (cross that bridge when breaking changes happen)

## Drift Check

last checked: 2026-04-18
