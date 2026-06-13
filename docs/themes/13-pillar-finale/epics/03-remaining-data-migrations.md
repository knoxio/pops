# Epic 03: Remaining data migrations

> Theme: [Pillar finale](../README.md)

## Scope

Migrate the ~22 remaining slices that still write to `pops.db` into per-pillar packages and containers. Use the proven N-track shape (4 PRs per slice: package + shim → journal split → cutover → shim deletion).

By the end of this epic, every table is owned by exactly one pillar's DB and the boot-time backfill is no longer necessary for new installs.

**Slice list:**

- **Media (8):** movies, tvShows, watchlist, watchHistory, library, discovery, arr, plex
  - `plex` ([PRD-172](../prds/172-media-plex-cutover/)) is documentation-only — no tables to move, slice has no N-track sequence.
- **Inventory (6):** items, reports, connections, documents, paperless, warranties
  - `reports` ([PRD-174](../prds/174-inventory-reports-cutover/)) is documentation-only — runtime aggregation over inventory tables owned by PRD-173 / PRD-176, no own schema, no N-track sequence.
- **Cerebrum (4):** engrams, plexus, glia, conversations
- **Core (4):** settings, tagRules (already shimmed), corrections (already shimmed), aiUsage

## PRDs

Each slice = 1 PRD covering the 4-PR sequence.

| #       | PRD                         | Summary                          | Status      |
| ------- | --------------------------- | -------------------------------- | ----------- |
| 165-186 | One PRD per slice (22 PRDs) | Standard N-track shape per slice | Not started |

Slices are mostly independent — parallel agent fleet shipped Theme 12's 6 finance slices in one night; same pattern works here. Cross-slice ordering only matters where FK relationships span slices (e.g. cerebrum.engrams may reference media URIs).

## Dependencies

- **Requires:** Epic 00 (contract packages), Epic 01 (SDK), Epic 02 (registry) — slices register themselves on boot
- **Unlocks:** Epic 09 (drop pops.db requires all tables claimed)

## Out of Scope

- Repartitioning load-bearing cross-pillar code (search, AI, worker) — Epic 08b
- Renaming misnamed legacy code under `core/` that's actually finance — Epic 08a
- Front-end consumption changes — Epic 10
