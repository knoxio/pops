# US-04: Finance dashboard

> PRD: [019 — Transactions](README.md)
> Status: Done

## Description

As a user, I want a dashboard page showing key financial stats and recent transactions so that I get a quick overview when opening the finance app.

## Acceptance Criteria

- [x] Stats cards: total transaction count, recent income (last 10), recent expenses (last 10), net balance
- [x] Stats card amounts are colour-coded by sign: positive → success (green), negative → destructive (red), zero → neutral foreground. Zero values never render in red or green.
- [x] Recent transactions list (last 10) with date, description, amount (colour-coded), entity name, account badge
- [x] Active budgets section (first 3) — links to budgets page
- [x] Loading skeletons for stats and transaction rows
- [x] Error state with expandable technical details
- [x] Empty state when no transactions exist
- [x] Read-only — no CRUD operations from dashboard
- [x] Transaction rows have hover effect and link to transactions page with filter applied

## Notes

Dashboard is the index page of the finance app (`/finance`). Data comes from `finance.transactions.list` (limit 10) and `finance.budgets.list` (limit 5, active only).
