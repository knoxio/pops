# US-02: Finance search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want finance data searchable so that I can find transactions, entities, and budgets from the global search.

## Acceptance Criteria

- [ ] Searches transactions by `description` column (case-insensitive LIKE)
- [ ] Searches entities by `name` column (case-insensitive LIKE)
- [ ] Searches budgets by `category` column (case-insensitive LIKE)
- [ ] Results include: URI, title, type badge, relevant metadata (amount, date, entity type)
- [ ] Relevance scoring: exact match (score 1.0) > starts-with (0.8) > contains (0.5)
- [ ] Each adapter returns its own `score` field using this formula — the engine does not re-score

## Notes

Transaction search returns the description + amount + date. Entity search returns name + type. Budget search returns category + period + amount.

Columns searched per type:
- **Transaction**: `description` only (not memo or tags — those are internal metadata)
- **Entity**: `name` only
- **Budget**: `category` only
