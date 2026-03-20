# Migration Conventions

This document defines the conventions for database migrations in POPS.

## File Naming

New migrations use **timestamp-based** names to avoid conflicts when multiple developers or agents work in parallel:

```
YYYYMMDDHHMMSS_domain_description.sql
```

Examples:
```
20260318120000_core_entity_types.sql
20260320093000_finance_subscription_tracking.sql
20260321140000_media_movies_table.sql
```

- **Timestamp:** UTC, to the second — collisions are extremely unlikely
- **Domain prefix:** Identifies which domain owns the change (`core`, `finance`, `inventory`, `media`, etc.)
- **Description:** Brief snake_case summary of what changes

### Legacy Numbered Migrations

Migrations `007_` through `011_` use sequential numbering from the original development phase. These are preserved as-is. All new migrations use timestamp-based names. Both formats coexist — the migration runner sorts by filename alphabetically, so timestamps naturally sort after the numbered migrations.

## Directory

All migrations live in a single flat directory:

```
apps/pops-api/src/db/migrations/
```

Domain is identified by the filename prefix, not by subdirectories.

## Migration File Format

A template is available at `apps/pops-api/src/db/migration-template.sql`.

Each migration file must include:

1. **Header comment** — domain, description, and what tables/columns are affected
2. **Forward migration SQL** — the actual schema changes
3. **Rollback comment block** — manual steps to undo the migration (not automated)

```sql
-- Migration: 20260320140000_finance_add_recurring_flag.sql
-- Domain:    finance
-- Description: Add recurring transaction flag
-- Changes:   transactions.recurring (new column)

-- Forward migration
ALTER TABLE transactions ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;

-- Rollback (manual)
-- SQLite doesn't support DROP COLUMN before 3.35.0.
-- To rollback:
--   1. Rebuild transactions table without the recurring column
--   2. DELETE FROM schema_migrations WHERE version = '20260320140000_finance_add_recurring_flag.sql';
```

## Rules

1. **One transaction per migration** — the migration runner wraps each file in a transaction automatically
2. **Idempotent where possible** — use `IF NOT EXISTS`, `IF NOT NULL` guards
3. **Forward-only** — never edit an applied migration; create a new one instead
4. **No destructive changes** — preserve existing data; add columns, don't remove them
5. **Single SQL file** — no multi-file migrations

## How Migrations Run

The migration runner (`apps/pops-api/src/db.ts` → `runMigrations()`) works as follows:

1. Creates `schema_migrations` table if it doesn't exist
2. Reads all applied migration versions from `schema_migrations`
3. Reads all `.sql` files from the migrations directory, sorted alphabetically
4. For each unapplied migration:
   - Executes the SQL in a transaction
   - Records the filename in `schema_migrations`
   - Logs: `[db] Applied migration: {filename}`

Migrations run automatically when the production database connection is opened.

## Fresh Database Initialization

Fresh databases (and named test environments) bypass migration files entirely. Instead, `initializeSchema()` in `apps/pops-api/src/db/schema.ts`:

1. Creates all tables with `CREATE TABLE IF NOT EXISTS` using the final schema
2. Pre-marks all known migrations as applied via the `INCLUDED_MIGRATIONS` array

This means:
- **When adding a new migration**, you must also:
  1. Add the migration filename to the `INCLUDED_MIGRATIONS` array in `schema.ts`
  2. Update the `initializeSchema()` CREATE TABLE statements to reflect the new schema
- This ensures fresh databases start with the correct schema AND don't re-run migrations

### Why Two Paths?

- **Production databases** evolve incrementally via ALTER TABLE migrations
- **Fresh databases** (dev setup, test environments) get the final schema directly — faster and avoids replaying a chain of ALTER TABLEs

## Table Naming Conventions

- **Snake_case, plural** for collections: `transactions`, `entities`, `budgets`
- **Domain prefix** for new tables: `media_movies`, `fitness_workouts`, `travel_trips`
- **Core tables** (shared across domains) have no prefix: `entities`, `ai_usage`, `schema_migrations`
- **Existing finance tables** keep their names without prefix: `transactions`, `budgets`, `wish_list`

## Conflict Resolution

If two migrations are created at the same second (extremely unlikely):
- One author renames theirs with a +1 second offset before merging
- The migration runner applies them in filename sort order regardless

## Current Migration Inventory

| File | Domain | Description |
|------|--------|-------------|
| `007_transaction_corrections.sql` | core | Transaction corrections learning system |
| `008_add_tags_to_transactions.sql` | finance | Add tags column to transactions |
| `009_environments.sql` | core | Named environment support |
| `010_uuid_primary_keys.sql` | core | Replace notion_id PKs with UUIDs |
| `011_add_checksum_raw_row.sql` | finance | Add checksum and raw_row for dedup |
