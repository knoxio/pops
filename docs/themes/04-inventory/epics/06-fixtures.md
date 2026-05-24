# Epic 06: Fixtures

> Theme: [Inventory](../README.md)
> Status: Done

## Summary

Fixtures are physical infrastructure objects (power outlets, wall-mounted panels, patch bays, cable runs) that inventory items can be connected to. Unlike items, fixtures are not owned — they represent the environment. A fixture has a name, type, optional location, and optional notes. Items connect to fixtures via a dedicated join table.

## Scope

**In scope:**

- `fixtures` table with location FK (SET NULL on delete)
- `item_fixture_connections` join table with cascade deletes and unique pair constraint
- Drizzle schema, SQL migration, type exports
- Full tRPC CRUD API for fixtures and item-fixture connections
- Integration tests covering all procedures

**Out of scope:**

- Fixture UI (future epic)
- Fixture types as an enumeration (free text for now)
- Fixture photos or documents

## PRDs

| PRD                                       | Summary                                     | Status |
| ----------------------------------------- | ------------------------------------------- | ------ |
| [PRD-104](../prds/104-fixtures/README.md) | Fixtures schema, migration, tRPC API, tests | Done   |

## Key Decisions

| Decision                       | Choice                            | Rationale                                                               |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| Separate from items            | Own `fixtures` table              | Fixtures aren't owned; moving house → empty table and reconnect         |
| FK behavior on location delete | SET NULL                          | Fixture survives location deletion, association is lost                 |
| FK behavior on fixture delete  | CASCADE to connections            | Orphaned connections have no meaning                                    |
| No ordering constraint         | Unique on `(item_id, fixture_id)` | Unlike item-item links, no A < B needed — fixture ID is a stable anchor |
