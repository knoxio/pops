# US-02: Entities page

> PRD: [023 — Entities](README.md)
> Status: Done

## Description

As a user, I want an entities page showing all merchants/payees so that I can browse and find entities.

## Acceptance Criteria

- [x] DataTable with columns: Name (sortable), Type (badge), ABN (monospace), Aliases (badges, +N overflow for long lists), Default Type (badge), Default Tags (badges)
- [x] Search by name (LIKE filter)
- [x] Filter by type (dropdown)
- [x] Loading skeleton while data fetches
- [x] Empty state when no entities match
- [x] Pagination with limit 100

## Notes

Currently read-only — CRUD dialogs are a separate US (US-03). The entities page shows the registry for browsing and verification.
