# PRD-009: DB Schema Patterns

> Epic: [04 — DB Schema Patterns](../../epics/04-db-schema-patterns.md)
> Status: Partial

## Overview

Establish the database conventions that all domains follow: SQLite as source of truth, migration format, entity type system, cross-domain foreign keys, table naming, seed data, settings table, and standard column patterns. After this PRD, any new domain can add tables that integrate cleanly with the existing schema.

## Migration Conventions

### Naming

Timestamp-based prefixes to avoid conflicts when multiple agents work in parallel:

```
YYYYMMDDHHMMSS_domain_description.sql

Examples:
20260318120000_core_entity_types.sql
20260320093000_finance_subscription_tracking.sql
20260321140000_media_movies_table.sql
```

### Rules

- Each migration is a single SQL transaction (runner wraps automatically)
- Idempotent where possible (`IF NOT EXISTS`, `IF NOT NULL` guards)
- Each file has a comment header: domain, description, affected tables/columns
- Rollback: documented as manual steps in a comment block — not automated
- Forward-only — never edit an applied migration
- No destructive changes — add columns, don't remove them
- One flat directory: `apps/pops-api/src/db/migrations/`
- Domain identified by filename prefix, not subdirectories

### Migration File Template

```sql
-- Migration: YYYYMMDDHHMMSS_domain_description.sql
-- Domain:    <domain>
-- Description: <what changes>
-- Changes:   <table.column> (new column / new table / etc.)

-- Forward migration
<SQL statements>

-- Rollback (manual)
-- <manual steps to undo>
```

### Fresh Database Path

Fresh databases (dev setup, test environments) use `initializeSchema()` which creates all tables directly with `CREATE TABLE IF NOT EXISTS`. An `INCLUDED_MIGRATIONS` array pre-marks all migrations as applied. This means when adding a new migration:
1. Add the filename to `INCLUDED_MIGRATIONS`
2. Update the `CREATE TABLE` statements in `initializeSchema()` to reflect the new schema

Production databases evolve incrementally via `ALTER TABLE` migrations.

## Entity Type System

Entities have a `type` column distinguishing their category:

| Type | Description | Examples |
|------|-------------|---------|
| `company` | Business, retailer, service provider | Woolworths, Netflix, Shell |
| `person` | Individual | Friend, family, employer |
| `place` | Location | Hotel, restaurant, airport |
| `brand` | Manufacturer/studio | Sony, Apple, Warner Bros |
| `organisation` | Non-profit, government, institution | ATO, Red Cross |

Single column, not a tags table — an entity is primarily one thing. Default is `company`. Extensible via new values, not schema changes.

## Cross-Domain Foreign Key Patterns

- Cross-domain FKs are always **nullable** — the link is optional
- `ON DELETE SET NULL` — breaking a link doesn't cascade destruction
- `ON UPDATE CASCADE` — if an ID changes, propagate
- All cross-domain FKs reference `id` (UUID), never other columns
- Document which domain "owns" each table

```sql
-- Example: inventory item links to purchase transaction
purchase_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL
```

## Table Naming Conventions

- Snake_case, plural: `transactions`, `entities`, `budgets`
- Domain prefix for new tables: `media_movies`, `media_tv_shows`, `fitness_workouts`
- Core tables (shared) have no prefix: `entities`, `ai_usage`, `settings`
- `PRAGMA foreign_keys = ON` — always enabled (SQLite has it off by default)

## Standard Column Patterns

- **Primary keys:** UUID via `crypto.randomUUID()` as `TEXT`
- **Timestamps:** `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `last_edited_time TEXT`
- **Soft references:** Use universal URI format (`pops:domain/type/id` per ADR-012) for flexible cross-domain references

## Settings Table

A core `settings` table for non-secret, user-configurable application state:

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Secrets vs Settings:**
- **Secrets** (ENV/Docker secrets): Infrastructure-level keys (`CLAUDE_API_KEY`, `TMDB_API_KEY`) — static per deployment
- **Settings** (DB): User-specific or dynamic data (`PLEX_TOKEN`, `PLEX_URL`, `LAST_SYNC_TIME`) — can change via UI

## Seed Data

Comprehensive test dataset for local development and e2e testing. Includes representative records across all domains. Reset via `mise db:seed`.

## Business Rules

- SQLite is the single source of truth — one file, no external dependencies
- `PRAGMA foreign_keys = ON` in every database connection
- Parameterised queries only — no string interpolation into SQL
- All new tables follow naming conventions — enforced by review
- Schema registry document lists all tables, owning domain, and cross-domain FKs

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Two migrations at the same second | One agent renames with +1 second offset. Runner applies in filename sort order |
| New domain needs a table | Create migration with `YYYYMMDDHHMMSS_domain_tablename.sql`, update `initializeSchema()` |
| Cross-domain FK target deleted | `ON DELETE SET NULL` — link becomes null, no cascade |
| Legacy `notion_id` on entities | Nullable, preserved. Drop in a future cleanup when no import tooling references it |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-migration-conventions](us-01-migration-conventions.md) | Establish migration naming, template file, runner, fresh DB path | Done | No (first) |
| 02 | [us-02-entity-types](us-02-entity-types.md) | Add entity type system (type column, supported values) | Done | Blocked by us-01 |
| 03 | [us-03-cross-domain-fks](us-03-cross-domain-fks.md) | Document FK patterns, formalise existing cross-domain links, create schema registry | Not started | Blocked by us-01 |
| 04 | [us-04-settings-table](us-04-settings-table.md) | Create core settings table for dynamic application configuration | Partial | Blocked by us-01 |
| 05 | [us-05-seed-data](us-05-seed-data.md) | Create comprehensive seed dataset for dev and e2e testing | Done | Blocked by us-01 |

US-02, US-03, US-04 can parallelise after US-01. US-05 depends on tables existing.

## Verification

- `mise db:init` creates a fresh database with all tables
- `mise db:seed` populates with test data
- `PRAGMA foreign_keys` returns `1` on every connection
- Schema registry document matches actual database schema
- Migration template exists and is usable
- All tests pass with seeded data

## Out of Scope

- Domain-specific table designs (each theme owns its schema)
- ORM choice (PRD-011)
- Automated rollback tooling
- Multi-database setup
