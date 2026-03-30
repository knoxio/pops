# ADR-004: API as Domain Modules in One Server

## Status

Accepted

## Context

POPS has multiple domains (finance, media, inventory, etc.) that all need API endpoints. The backend needs a structure that keeps domains isolated while sharing one database and one process.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| One server, domain-grouped tRPC routers | Simple, one process, cross-domain joins trivial, one deployment | All code in one server, modules must be disciplined about boundaries |
| Separate microservices per domain | True isolation, independent scaling | Inter-service communication, distributed transactions, multiple processes — zero benefit for one user and one SQLite DB |
| One server, flat module structure | Simple | Doesn't scale past 10 modules, no logical grouping |

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
