# US-01: Transaction schema and API

> PRD: [019 — Transactions](README.md)
> Status: To Review

## Description

As a developer, I want the transaction table and CRUD API procedures so that financial data can be stored and queried.

## Acceptance Criteria

- [ ] `transactions` table created with all columns per the data model
- [ ] Indexes on: date, account, entity_id, last_edited_time, checksum (unique)
- [ ] `finance.transactions.list` — paginated, filterable (search, account, startDate, endDate, tag, entityId, type), ordered by date DESC
- [ ] `finance.transactions.get` — returns single transaction, 404 if not found
- [ ] `finance.transactions.create` — generates UUID, sets last_edited_time, validates type enum
- [ ] `finance.transactions.update` — partial update, only changes provided fields, updates last_edited_time
- [ ] `finance.transactions.delete` — removes transaction, 404 if not found
- [ ] `finance.transactions.suggestTags` — returns tags from corrections + entity defaults, deduplicated and sorted
- [ ] `finance.transactions.availableTags` — returns all distinct tags across all transactions
- [ ] Tags stored as JSON array, parsed correctly on read
- [ ] Checksum uniqueness enforced at DB level
- [ ] Tests cover CRUD, filtering, edge cases (no entity, malformed tags)

## Notes

Tag suggestion is rule-based only (no LLM) — uses `findMatchingCorrection()` from corrections service and `suggestTags()` utility for entity defaults.
