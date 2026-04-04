# US-06: Budgets search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search budgets by category and return typed `SearchHit` results with period and amount.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "budgets"`, icon: `"PiggyBank"`, color: `"green"`
- [ ] Searches budgets by `category` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField: "category"` and `matchType` set correctly per hit
- [ ] Hit data shape: `{ category, period, amount }`
- [ ] Respects `options.limit` parameter
- [ ] Tests: search returns correct hits, scoring correct

## Notes

Only `category` is searched.
