# Epic 00: Schema & Data Model

> Theme: [Inventory](../README.md)

## Scope

Define the inventory domain schema: items with rich metadata, hierarchical location tree, bidirectional item connections, photos, and asset IDs. Build the base tRPC routers for all inventory entities.

## PRDs

| #   | PRD                                                                          | Summary                                                                                                                      | Status |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| 043 | [Inventory Data Model & API](../prds/043-inventory-data-model-api/README.md) | Items table, locations tree (self-referential parent_id), connections junction table, photos, asset IDs, notes, tRPC routers | Done   |

## Dependencies

- **Requires:** Foundation (API server, DB schema patterns, shared entities per ADR-005)
- **Unlocks:** Every other inventory epic

## Out of Scope

- UI pages (Epic 01)
- Paperless-ngx integration (Epic 04)
- Reporting queries (Epic 05)
