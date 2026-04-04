# US-05: Entities search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As the system, I search entities by name and return typed `SearchHit` results with entity type and aliases.

## Acceptance Criteria

- [x] Adapter registered with `domain: "entities"`, icon: `"Building2"`, color: `"green"`
- [x] Searches entities by `name` column (case-insensitive LIKE)
- [x] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [x] `matchField: "name"` and `matchType` set correctly per hit
- [x] Hit data shape: `{ name, type, aliases }`
- [x] Respects `options.limit` parameter
- [x] Tests: search returns correct hits, scoring correct

## Notes

Entities are shared across domains (used by finance transactions). Only `name` is searched.
