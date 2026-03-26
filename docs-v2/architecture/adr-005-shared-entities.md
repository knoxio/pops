# ADR-005: Entities as a Platform-Level Concept

## Status

Accepted

## Context

Entities (merchants, companies, people, brands) appear across multiple domains — a company like Woolworths shows up in finance (transactions), inventory (where you bought it), and potentially travel or recipes. Entities need to be shared across all domains, not owned by any single one.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Shared entity table in `core/` module | One source of truth, cross-domain linking, consistent naming | Requires a `type` column to distinguish categories |
| Per-domain entity tables | Full isolation per domain | Duplicate data, no cross-domain linking, inconsistent naming |
| No entity abstraction (inline strings) | Zero overhead | No linking, no search, no consistency |

## Decision

Entities are a platform-level concept in the `core/` module. The `entities` table has a `type` column (company, person, brand, service, place) and is referenced by all domains via foreign keys.

- **Database:** `entities` table, shared across all domains
- **API:** `core/entities/` module
- **Frontend:** Entity components (selector, create dialog) live in `@pops/ui` since they're used everywhere

## Consequences

- Entities are the connective tissue between domains — "show me everything related to Woolworths" works across finance, inventory, and future apps
- All domains reference the same entity record — consistent naming and deduplication
- Entity types enable filtering and domain-specific behaviour without separate tables
- New domains get entity linking for free by referencing the shared table
