# US-02: Add entity type system

> PRD: [009 — DB Schema Patterns](README.md)
> Status: To Review

## Description

As a developer, I want entities to have a `type` column so that they can be distinguished across domains (company, person, place, brand, organisation).

## Acceptance Criteria

- [ ] Migration adds `type TEXT NOT NULL DEFAULT 'company'` to entities table
- [ ] Entity service and router accept and return `type`
- [ ] Type validation enforces supported values (company, person, place, brand, organisation)
- [ ] Entity API tests cover type filtering and validation
- [ ] `initializeSchema()` updated with the type column

## Notes

Default is `company` — the vast majority of entities are merchants. New types are added by updating the validation list, not by schema changes.
