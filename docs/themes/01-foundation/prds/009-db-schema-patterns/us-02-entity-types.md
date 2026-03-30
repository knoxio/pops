# US-02: Add entity type system

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

## Description

As a developer, I want entities to have a `type` column so that they can be distinguished across domains (company, person, place, brand, organisation).

## Acceptance Criteria

- [x] Migration adds `type TEXT NOT NULL DEFAULT 'company'` to entities table
- [x] Entity service and router accept and return `type`
- [x] Type validation enforces supported values (company, person, place, brand, organisation)
- [x] Entity API tests cover type filtering and validation
- [x] `initializeSchema()` updated with the type column

## Notes

Default is `company` — the vast majority of entities are merchants. New types are added by updating the validation list, not by schema changes.
