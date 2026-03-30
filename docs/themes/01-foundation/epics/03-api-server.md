# Epic 03: API Server

> Theme: [Foundation](../README.md)

## Scope

Build `pops-api` — a single Express + tRPC server with domain-grouped router modules. Each domain (core, finance, media, inventory) is a tRPC router composed at the top level. Middleware handles auth, rate limiting, and error handling.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 008 | [API Server](../prds/008-api-server/README.md) | Domain module structure, router composition, middleware, module import rules | Partial |

## Dependencies

- **Requires:** Epic 00 (monorepo toolchain)
- **Unlocks:** All domain modules (finance, media, inventory need the API structure)

## Out of Scope

- Domain-specific endpoints (each theme owns its own modules)
- Database schema (Epic 04)
- Deployment configuration (Infrastructure theme)
