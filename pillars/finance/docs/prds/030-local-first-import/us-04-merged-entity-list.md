# US-04: Merged entity list

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Done

## Description

As a system, I want a pure function that computes a merged entity list from DB entities and pending entities so that all dropdowns, matching logic, and preview components see a single unified entity set during import.

Pending entities are adapted to the `Entity` interface. When a pending entity has the same name (case-insensitive) as a DB entity, the pending version wins in the merged list (the DB entry is excluded).

## Acceptance Criteria

- [x] A pure function `computeMergedEntities(dbEntities: Entity[], pendingEntities: PendingEntity[]) => Entity[]` exists and is exported.
- [x] Pending entities are mapped to the `Entity` interface, using their `tempId` as `id`, their `name`, and their `type`. Other `Entity` fields use sensible defaults (e.g. empty aliases, null optional fields).
- [x] When a pending entity's name matches a DB entity's name (case-insensitive comparison), the pending entity replaces the DB entity in the output.
- [x] When there is no name collision, both DB and pending entities appear in the output.
- [x] DB entities appear first in the output, followed by non-colliding pending entities (or a single sorted list — consistent ordering is the requirement).
- [x] The function is memoized so that identical inputs (by reference) return the same output reference.
- [x] Unit tests cover: zero pending, pending with no collision, pending replacing DB entity, multiple collisions, case-insensitive collision (e.g. "woolworths" vs "Woolworths"), empty DB list with pending entities.

## Notes

- The `Entity` type comes from `@pops/db-types` or the existing tRPC entity list response type. Inspect the actual type at implementation time to determine which fields need defaults.
- The `PendingEntity` type is `{ tempId: string; name: string; type: string }` (from US-01).
- This function is consumed by US-05 (entity dropdowns) and potentially by matching logic that needs the full entity list.
