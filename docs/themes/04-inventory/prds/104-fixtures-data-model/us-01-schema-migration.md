# US-01: Fixtures Schema & Migration

> PRD: [Fixtures Data Model](README.md)

## Description

As a developer, I want the `fixtures` and `item_fixture_connections` tables to exist in the database so the fixtures domain has a place to store data.

## Acceptance Criteria

- [ ] `fixtures` table is defined in `apps/pops-api/src/db/schema.ts` with columns: `id` (TEXT PK UUID), `name` (TEXT NOT NULL), `type` (TEXT nullable), `location_id` (TEXT nullable, FK → `locations(id)` ON DELETE SET NULL), `notes` (TEXT nullable), `created_at`, `updated_at`, `last_edited_time` (TEXT NOT NULL)
- [ ] `item_fixture_connections` table is defined with: `id` (INTEGER PK AUTOINCREMENT), `item_id` (TEXT NOT NULL, FK → `home_inventory(id)` ON DELETE CASCADE), `fixture_id` (TEXT NOT NULL, FK → `fixtures(id)` ON DELETE CASCADE), `created_at` (TEXT NOT NULL), UNIQUE on `(item_id, fixture_id)`
- [ ] Indexes created: `idx_fixtures_location`, `idx_fixtures_type`, `idx_fixtures_name`, `idx_ifc_item`, `idx_ifc_fixture`
- [ ] A migration file is added under `apps/pops-api/src/modules/inventory/migrations/` (or wherever inventory migrations live) and registered in the inventory module manifest
- [ ] The migration is safe to run against an existing database (uses `CREATE TABLE IF NOT EXISTS`)
- [ ] Drizzle ORM table objects (or equivalent) are exported for use by the service layer

## Notes

Check where existing inventory migrations are defined — look at how `048-connections-graph` or the initial inventory schema migration was structured and follow the same pattern. The migration must be added to the inventory module's `migrations` array in `apps/pops-api/src/modules/inventory/index.ts`.
