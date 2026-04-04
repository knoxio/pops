# US-04: Transactions search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As the system, I search transactions by description and return typed `SearchHit` results with amount, date, and entity.

## Acceptance Criteria

- [x] Adapter registered with `domain: "transactions"`, icon: `"ArrowRightLeft"`, color: `"green"`
- [x] Searches transactions by `description` column (case-insensitive LIKE)
- [x] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [x] `matchField: "description"` and `matchType` set correctly per hit
- [x] Hit data shape: `{ description, amount, date, entityName, type: "income" | "expense" | "transfer" }`
- [x] Respects `options.limit` parameter
- [x] Tests: search returns correct hits, scoring correct

## Notes

Only `description` column is searched — not memo or tags.
