# US-02: `searchAdapter` over HA entities

> PRD: [HA bridge pillar](README.md)

## Description

As a user querying federated POPS search for "kitchen temperature", I want the HA bridge pillar to return matching HA entities — ranked so that exact `area` + `device_class` matches beat partial friendly-name matches — so that the search surface treats HA entities as first-class POPS data.

## Acceptance Criteria

- [ ] An FTS5 virtual table `ha_entities_fts(entity_id, friendly_name, area, device_class)` exists, populated by triggers on `ha_entities` insert / update / delete.
- [ ] The pillar's manifest declares `searchAdapter: { id: 'ha-entities', label: 'Home Assistant entities' }` and is discovered by the central registry (Epic 02) and the search registry (Epic 06).
- [ ] The adapter implements the `SearchAdapter` interface from `@pops/pillar-sdk`: takes a query string, returns `{ items: { id: string; label: string; score: number; metadata: { domain, area, deviceClass, state } }[] }`.
- [ ] Ranking: exact-match `area` token raises score; exact-match `device_class` token raises score; friendly-name FTS5 rank is the baseline.
- [ ] Query "kitchen temperature" against a seeded fixture (`sensor.kitchen_temperature` with `area=kitchen`, `device_class=temperature`) returns that entity as the top result.
- [ ] If `ha_entities` is empty (cold boot), the adapter returns `{ items: [] }` without error.
- [ ] Unit tests cover: tokenisation, ranking, area/device-class boosts, empty-table case, FTS rebuild after entity rename.

## Notes

- Depends on US-01 — `ha_entities` must be populated.
- The exact `SearchAdapter` interface is defined by Epic 06 / PRD-197. This story consumes it; no SDK changes here.
- Ranking weights are starting values — tune from real queries later. PRD-229 is not the place to lock weights.
