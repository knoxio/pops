# US-02: Entities page

> PRD: [023 — Entities](README.md)
> Status: To Review

## Description

As a user, I want an entities page showing all merchants/payees so that I can browse and find entities.

## Acceptance Criteria

- [ ] DataTable with columns: Name (sortable), Type (badge), ABN (monospace), Aliases (badges, +N overflow for long lists), Default Type (badge), Default Tags (badges)
- [ ] Search by name (LIKE filter)
- [ ] Filter by type (dropdown)
- [ ] Loading skeleton while data fetches
- [ ] Empty state when no entities match
- [ ] Pagination with limit 100

## Notes

Currently read-only — CRUD dialogs are a separate US (US-03). The entities page shows the registry for browsing and verification.
