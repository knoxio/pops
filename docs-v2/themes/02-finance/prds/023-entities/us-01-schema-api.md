# US-01: Entity schema and API

> PRD: [023 — Entities](README.md)
> Status: To Review

## Description

As a developer, I want the entity table and CRUD API so that merchants/payees can be stored and queried by any domain.

## Acceptance Criteria

- [ ] `entities` table created with all columns per the data model
- [ ] CRUD procedures: list (search, type filter, pagination), get, create, update, delete
- [ ] Unique name enforcement (case-sensitive, returns 409 on conflict)
- [ ] Aliases: API accepts array, stores as comma-separated, returns as array
- [ ] Default tags: API accepts array, stores as JSON, returns as array
- [ ] Type defaults to "company" if not provided
- [ ] Deletion: FK SET NULL on all related tables (transactions, inventory)
- [ ] Tests cover CRUD, duplicate prevention, alias serialization

## Notes

Entity module lives in `core/` — it's platform-level, not finance-specific. Any domain can import and reference entities.
