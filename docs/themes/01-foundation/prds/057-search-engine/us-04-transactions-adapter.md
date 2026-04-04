# US-04: Transactions search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search transactions by description and return typed `SearchHit` results with amount, date, and entity.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "transactions"`, icon: `"ArrowRightLeft"`, color: `"green"`
- [ ] Searches transactions by `description` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField: "description"` and `matchType` set correctly per hit
- [ ] Hit data shape: `{ description, amount, date, entityName, type: "income" | "expense" | "transfer" }`
- [ ] Respects `options.limit` parameter
- [ ] Tests: search returns correct hits, scoring correct

## Notes

Only `description` column is searched — not memo or tags.
