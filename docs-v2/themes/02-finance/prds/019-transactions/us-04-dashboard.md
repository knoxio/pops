# US-04: Finance dashboard

> PRD: [019 — Transactions](README.md)
> Status: To Review

## Description

As a user, I want a dashboard page showing key financial stats and recent transactions so that I get a quick overview when opening the finance app.

## Acceptance Criteria

- [ ] Stats cards: total transaction count, recent income (last 10), recent expenses (last 10), net balance
- [ ] Recent transactions list (last 10) with date, description, amount (colour-coded), entity name, account badge
- [ ] Active budgets section (first 3) — links to budgets page
- [ ] Loading skeletons for stats and transaction rows
- [ ] Error state with expandable technical details
- [ ] Empty state when no transactions exist
- [ ] Read-only — no CRUD operations from dashboard
- [ ] Transaction rows have hover effect and link to transactions page with filter applied

## Notes

Dashboard is the index page of the finance app (`/finance`). Data comes from `finance.transactions.list` (limit 10) and `finance.budgets.list` (limit 5, active only).
