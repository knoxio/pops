# US-02: Finance search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want finance data searchable so that I can find transactions, entities, and budgets from the global search, each rendered with finance-specific layout.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "finance"`, icon: `"DollarSign"`, color: `"green"`
- [ ] Searches transactions by `description` column (case-insensitive LIKE)
- [ ] Searches entities by `name` column (case-insensitive LIKE)
- [ ] Searches budgets by `category` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField` and `matchType` set correctly per hit
- [ ] Hit data shapes:
  - Transaction: `{ description, amount, date, entityName, type: "income" | "expense" | "transfer" }`
  - Entity: `{ name, type, aliases }`
  - Budget: `{ category, period, amount }`
- [ ] `ResultComponent` renders transactions with amount (green for income, red for expense) + date. Entities with type badge. Budgets with period + amount
- [ ] `ResultComponent` highlights the matched portion of text using `query` prop + `matchField`/`matchType`
- [ ] Tests: search returns correct hits, scoring is correct, match info is accurate

## Notes

Transaction search uses `description` only — not memo or tags. Entity search uses `name` only. Budget search uses `category` only.
