# US-02: Transactions page

> PRD: [019 — Transactions](README.md)
> Status: To Review

## Description

As a user, I want a transaction list page with filtering and sorting so that I can find and review my financial transactions.

## Acceptance Criteria

- [ ] DataTable displays: Date (sortable), Description + Entity name (sub-text), Account, Amount (sortable, red for expenses, green for income), Type badge, Tags column
- [ ] Search by description (full-text LIKE)
- [ ] Filter by: Account (select dropdown), Type (Income/Expense/Transfer), Tags (text search)
- [ ] Column sorting: Date and Amount, ascending/descending
- [ ] Pagination: 25/50/100 rows per page
- [ ] Loading skeleton while data fetches
- [ ] Empty state when no transactions match filters
- [ ] Amount formatting: currency symbol, 2 decimal places, colour-coded

## Notes

The Tags column renders tag badges. Clicking a tag badge opens the TagEditor (US-03). Account filter options: ANZ Everyday, ANZ Savings, Amex, ING Savings, Up Everyday.
