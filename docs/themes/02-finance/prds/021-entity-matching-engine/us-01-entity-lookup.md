# US-01: Load entity lookup and alias maps

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want entity name→id and alias→entity maps loaded from the database so that the matching pipeline has reference data.

## Acceptance Criteria

- [x] Entity lookup: `{ name (lowercase) → id }` from all entities
- [x] Alias map: `{ alias (lowercase) → entity name }` from comma-separated aliases per entity
- [x] Both loaded once per import batch (not per transaction)
- [x] Whitespace-only aliases ignored during parsing
- [x] Maps available to all matching stages

## Notes

Performance matters — this runs once per import, not per transaction. 900+ entities is the current scale.
