# US-06b: Budgets result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want budget search results to show category, period, and amount so I can find the right budget.

## Acceptance Criteria

- [ ] `BudgetsResultComponent` registered in frontend registry for domain `"budgets"`
- [ ] Renders: category + period (monthly/yearly) + formatted amount
- [ ] Highlights matched portion of category using `query` prop + `matchField`/`matchType`
- [ ] Tests: renders correctly, highlighting works

## Notes

Component lives in `packages/app-finance/`. Depends on US-06 for hit data shape.
