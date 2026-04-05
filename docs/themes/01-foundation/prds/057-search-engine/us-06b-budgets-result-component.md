# US-06b: Budgets result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want budget search results to show category, period, and amount so I can find the right budget.

## Acceptance Criteria

- [x] `BudgetsResultComponent` registered in frontend registry for domain `"budgets"`
- [x] Renders: category + period (monthly/yearly) + formatted amount
- [x] Highlights matched portion of category using `query` prop + `matchField`/`matchType`
- [x] Tests: renders correctly, highlighting works

## Notes

Component lives in `packages/app-finance/`. Depends on US-06 for hit data shape.
