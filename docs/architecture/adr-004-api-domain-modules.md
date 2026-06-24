# ADR-004: API as Domain Modules in One Server

## Status

Superseded by [ADR-026: Per-Domain Pillar Architecture](./adr-026-pillar-architecture.md) — 2026-06-09. The "one server, domain-grouped tRPC routers" pattern this ADR adopted held through early Epic 00 work but accumulated three different sub-patterns for "where backend services live" across food / finance / lists. The pillar architecture replaces it with per-domain isolation (own DB, own container, own contract package). Migration is per-domain; until each domain migrates, ADR-004's pattern continues to apply for that domain.

## Context

POPS has multiple domains (finance, media, inventory, etc.) that all need API endpoints. The backend needs a structure that keeps domains isolated while sharing one database and one process.

## Options Considered

| Option                                  | Pros                                                            | Cons                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| One server, domain-grouped tRPC routers | Simple, one process, cross-domain joins trivial, one deployment | All code in one server, modules must be disciplined about boundaries                                                    |
| Separate microservices per domain       | True isolation, independent scaling                             | Inter-service communication, distributed transactions, multiple processes — zero benefit for one user and one SQLite DB |
| One server, flat module structure       | Simple                                                          | Doesn't scale past 10 modules, no logical grouping                                                                      |

## Decision

One Express + tRPC server with domain-grouped router modules. Each domain (core, finance, media, inventory) is a tRPC router composed at the top level.

Module rules:

- Domain modules can import from `core/` (entities, shared utilities)
- Domain modules cannot import from each other directly
- Cross-domain queries go through `core/` or a dedicated cross-domain layer
- Each module has: router, service, types, tests

## Consequences

- One server, one database, one deployment — minimal operational overhead
- Clear domain boundaries enforced by import rules
- Cross-domain joins are trivial (same SQLite file)
- Adding a new domain means adding a new module directory and registering its router

## Manifest-Driven Composition

Each domain module exports a `ModuleManifest` ([plugin-contract](../themes/foundation/prds/plugin-contract/README.md)) declaring its router, schema, settings, and surfaces. The tRPC root composes only the routers of modules listed in `POPS_APPS` / `POPS_OVERLAYS`; modules absent from those env vars do not mount, and their migrations do not run. Default (`POPS_APPS` unset) preserves current behaviour. See [Epic: Modular Module Runtime](../themes/foundation/epics/modular-module-runtime.md) and [plugin-contract](../themes/foundation/prds/plugin-contract/README.md).

Cross-module import boundaries (`apps/pops-api/src/modules/<x>/**` may not import from `<y>/**` where x ≠ y, except `core`) are lint-enforced by [module-import-boundaries](../themes/foundation/prds/module-import-boundaries/README.md), not honour-system.
