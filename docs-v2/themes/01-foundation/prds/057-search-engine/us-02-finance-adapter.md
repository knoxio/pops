# US-02: Finance search adapter

> PRD: [057 — Search Engine](README.md)
> Status: To Review

## Description

As a user, I want finance data searchable so that I can find transactions, entities, and budgets from the global search.

## Acceptance Criteria

- [ ] Searches transactions by description (LIKE)
- [ ] Searches entities by name (LIKE)
- [ ] Searches budgets by category (LIKE)
- [ ] Results include: URI, title, type badge, relevant metadata (amount, date, entity type)
- [ ] Relevance scoring: exact match > starts-with > contains

## Notes

Transaction search returns the description + amount + date. Entity search returns name + type. Budget search returns category + period + amount.
