# US-04b: Transactions result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want transaction search results to show description, amount (colored by type), and date so I can identify the right transaction.

## Acceptance Criteria

- [ ] `TransactionsResultComponent` registered in frontend registry for domain `"transactions"`
- [ ] Renders: description + amount (green for income, red for expense, muted for transfer) + date
- [ ] Entity name shown if available (subtle, secondary text)
- [ ] Highlights matched portion of description using `query` prop + `matchField`/`matchType`
- [ ] Tests: renders correctly for each transaction type, highlighting works

## Notes

Component lives in `packages/app-finance/`. Depends on US-04 for hit data shape.
