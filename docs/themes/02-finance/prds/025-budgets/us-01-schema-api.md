# US-01: Budget schema and API

> PRD: [025 — Budgets](README.md)
> Status: Done

## Description

As a developer, I want the budget table and CRUD API so that spending targets can be managed.

## Acceptance Criteria

- [x] `budgets` table with all columns and UNIQUE constraint on (category, period) — implemented as `CREATE UNIQUE INDEX idx_budgets_category_period ON budgets(category, COALESCE(period, char(0)))` to handle null period correctly
- [x] Null period uniqueness handled correctly (null == null) — service uses `isNull()` check, tested
- [x] CRUD procedures: list (search, period, active filters), get, create, update, delete
- [x] Create: active defaults to 0 (false), enforces unique constraint
- [x] Duplicate returns 409 CONFLICT with descriptive message
- [x] Active stored as 0/1, returned as boolean
- [x] Tests cover CRUD, uniqueness (including null period), conflict error

## Notes

The null period uniqueness is an edge case — two budgets for "Groceries" with null period should conflict.
