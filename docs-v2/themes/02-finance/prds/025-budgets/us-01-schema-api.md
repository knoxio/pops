# US-01: Budget schema and API

> PRD: [025 — Budgets](README.md)
> Status: Partial

## Description

As a developer, I want the budget table and CRUD API so that spending targets can be managed.

## Acceptance Criteria

- [ ] `budgets` table with all columns and UNIQUE constraint on (category, period) — table exists with all columns; no DB-level UNIQUE constraint (enforced in application code)
- [x] Null period uniqueness handled correctly (null == null) — service uses `isNull()` check, tested
- [x] CRUD procedures: list (search, period, active filters), get, create, update, delete
- [x] Create: active defaults to 0 (false), enforces unique constraint
- [x] Duplicate returns 409 CONFLICT with descriptive message
- [x] Active stored as 0/1, returned as boolean
- [x] Tests cover CRUD, uniqueness (including null period), conflict error

## Notes

The null period uniqueness is an edge case — two budgets for "Groceries" with null period should conflict.
