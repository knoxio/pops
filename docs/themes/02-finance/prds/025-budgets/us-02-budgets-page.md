# US-02: Budgets page

> PRD: [025 — Budgets](README.md)
> Status: Done

## Description

As a user, I want a budgets page showing all budget categories so that I can see my spending targets.

## Acceptance Criteria

- [x] DataTable with columns: Category (sortable), Period (Monthly/Yearly badge), Amount (sortable, right-aligned), Status (Active/Inactive badge), Notes (truncated)
- [x] Search by category
- [x] Filter by: Period (One-time/Monthly/Yearly), Status (Active/Inactive)
- [x] Pagination with limit 100
- [x] Loading skeleton and empty state

## Notes

Amount formatting with currency symbol. Null amounts show as "—" (no limit).
