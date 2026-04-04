# US-05: Entities search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search entities by name and return typed `SearchHit` results with entity type and aliases.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "entities"`, icon: `"Building2"`, color: `"green"`
- [ ] Searches entities by `name` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField: "name"` and `matchType` set correctly per hit
- [ ] Hit data shape: `{ name, type, aliases }`
- [ ] Respects `options.limit` parameter
- [ ] Tests: search returns correct hits, scoring correct

## Notes

Entities are shared across domains (used by finance transactions). Only `name` is searched.
