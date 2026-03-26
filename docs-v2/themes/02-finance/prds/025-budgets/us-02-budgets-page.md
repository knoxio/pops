# US-02: Budgets page

> PRD: [025 — Budgets](README.md)
> Status: Partial

## Description

As a user, I want a budgets page showing all budget categories so that I can see my spending targets.

## Acceptance Criteria

- [ ] DataTable with columns: Category (sortable), Period (Monthly/Yearly badge), Amount (sortable, right-aligned), Status (Active/Inactive badge), Notes (truncated) — Period column shows plain text, not a badge
- [x] Search by category
- [x] Filter by: Period (Monthly/Yearly), Status (Active/Inactive)
- [x] Pagination with limit 100
- [x] Loading skeleton and empty state

## Notes

Amount formatting with currency symbol. Null amounts show as "—" (no limit).
