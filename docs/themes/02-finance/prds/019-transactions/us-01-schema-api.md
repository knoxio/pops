# US-01: Transaction schema and API

> PRD: [019 — Transactions](README.md)
> Status: Done

## Description

As a developer, I want the transaction table and CRUD API procedures so that financial data can be stored and queried.

## Acceptance Criteria

- [x] `transactions` table created with all columns per the data model
- [x] Indexes on: date, account, entity_id, last_edited_time, checksum (unique)
- [x] `finance.transactions.list` — paginated, filterable (search, account, startDate, endDate, tag, entityId, type), ordered by date DESC
- [x] `finance.transactions.get` — returns single transaction, 404 if not found
- [x] `finance.transactions.create` — generates UUID, sets last_edited_time, validates type enum
- [x] `finance.transactions.update` — partial update, only changes provided fields, updates last_edited_time
- [x] `finance.transactions.delete` — removes transaction, 404 if not found
- [x] `finance.transactions.suggestTags` — returns tags from corrections + entity defaults, deduplicated and sorted
- [x] `finance.transactions.availableTags` — returns all distinct tags across all transactions
- [x] Tags stored as JSON array, parsed correctly on read
- [x] Checksum uniqueness enforced at DB level
- [x] Tests cover CRUD, filtering, edge cases (no entity, malformed tags)

## Notes

Tag suggestion is rule-based only (no LLM) — uses `findMatchingCorrection()` from corrections service and `suggestTags()` utility for entity defaults.
