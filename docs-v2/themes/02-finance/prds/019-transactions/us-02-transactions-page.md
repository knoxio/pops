# US-02: Transactions page

> PRD: [019 — Transactions](README.md)
> Status: Done

## Description

As a user, I want a transaction list page with filtering and sorting so that I can find and review my financial transactions.

## Acceptance Criteria

- [x] DataTable displays: Date (sortable), Description + Entity name (sub-text), Account, Amount (sortable, red for expenses, green for income), Type badge, Tags column
- [x] Search by description (full-text LIKE)
- [x] Filter by: Account (select dropdown), Type (Income/Expense/Transfer), Tags (text search)
- [x] Column sorting: Date and Amount, ascending/descending
- [x] Pagination: 25/50/100 rows per page
- [x] Loading skeleton while data fetches
- [x] Empty state when no transactions match filters
- [x] Amount formatting: currency symbol, 2 decimal places, colour-coded

## Notes

The Tags column renders tag badges. Clicking a tag badge opens the TagEditor (US-03). Account filter options: ANZ Everyday, ANZ Savings, Amex, ING Savings, Up Everyday.
