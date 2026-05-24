# US-01: Schema & migration

> PRD: [PRD-104 — Fixtures Data Model](README.md)
> Status: Done

## Goal

Define the `fixtures` and `item_fixture_connections` Drizzle schema tables, export all types from `@pops/db-types`, and generate + commit the migration SQL.

## Acceptance Criteria

- [x] `packages/db-types/src/schema/fixtures.ts` — `fixtures` table with `id` (UUID PK), `name`, `type`, `locationId` (FK → locations, SET NULL), `notes`, `createdAt`, `lastEditedTime`; indexes on `locationId`, `type`, `name`
- [x] `packages/db-types/src/schema/item-fixture-connections.ts` — `itemFixtureConnections` table with auto-increment PK, `itemId` (FK → homeInventory, CASCADE), `fixtureId` (FK → fixtures, CASCADE), `createdAt`; unique on `(itemId, fixtureId)`; indexes on both FK columns
- [x] Both tables exported from `packages/db-types/src/schema/index.ts`
- [x] `FixtureRow`, `FixtureInsert`, `ItemFixtureConnectionRow` type aliases exported from `packages/db-types/src/index.ts`
- [x] Migration `apps/pops-api/src/db/drizzle-migrations/0057_slimy_phalanx.sql` generated and committed
- [x] Migration registered in `migration-ownership.ts` (owner: `inventory`) and `modules/inventory/migrations.ts`
- [x] All existing tests pass after schema addition
