# PRD-005: DB Schema Patterns

**Epic:** [04 — DB Schema Patterns](../themes/foundation/epics/04-db-schema-patterns.md)
**Theme:** Foundation
**Status:** Approved
**ADRs:** [003 — Component Library & API](../architecture/adr-003-component-library-and-api.md)
**Can run in parallel with:** PRD-004 (API Modularisation)

## Problem Statement

POPS has one database with tables created by a single `initializeSchema()` function and incremental SQL migrations. As new domains (media, fitness, travel) add their own tables, we need conventions to prevent migration conflicts, establish cross-domain linking patterns, and evolve the entity model from finance-only to platform-level.

## Goal

Establish database conventions that scale to 10+ domains. Upgrade the entity table to support types/tags. Document patterns so that any new app PRD can follow them without re-inventing the approach.

## Requirements

### R1: Migration Conventions

**Naming:** Timestamp-based prefixes to avoid conflicts when multiple agents work in parallel.

```
YYYYMMDDHHMMSS_domain_description.sql

Examples:
20260318120000_core_entity_types.sql
20260320093000_finance_subscription_tracking.sql
20260321140000_media_movies_table.sql
```

**Rules:**
- Each migration file is a single SQL transaction
- Migrations are idempotent where possible (`IF NOT EXISTS`, `IF NOT NULL`)
- Each migration has a comment header: domain, description, what it changes
- Rollback: not automated. Document manual rollback steps in a comment block at the bottom of each migration file
- Migrations only go forward — no editing applied migrations

**Directory:** Migrations stay in `apps/pops-api/src/db/migrations/`. One flat directory, domain identified by filename prefix.

### R2: Entity Type System

Entities currently have: `id`, `name`, `notion_id` (legacy nullable), `aliases`, `default_category`, `default_location`, `default_country`, `default_online`, `abn`.

**Add a `type` column:**

```sql
ALTER TABLE entities ADD COLUMN type TEXT NOT NULL DEFAULT 'company';
```

Supported types (extensible via new values, not schema changes):
- `company` — Business, retailer, service provider (Woolworths, Netflix, Shell)
- `person` — Individual (friend, family, employer)
- `place` — Location (hotel, restaurant, airport)
- `brand` — Manufacturer/studio (Sony, Apple, Warner Bros)
- `organisation` — Non-profit, government, institution

**Why a single column, not a tags table?** An entity is primarily one thing — Woolworths is a company, not a company AND a place. If an entity needs multiple classifications, that's better handled by the domains that reference it (e.g., media tags "Warner Bros" as "studio", inventory tags it as "brand"). Keep the core model simple.

**Migration for existing data:** All existing entities default to `company`. The ~940 entities are overwhelmingly merchants. Manual reclassification of employers as `person` and similar corrections can be done via a data migration script or left as a future task.

### R3: Cross-Domain Foreign Key Patterns

**Pattern:** Nullable foreign keys with no CASCADE. Domains link to each other optionally — deleting a transaction doesn't delete an inventory item.

```sql
-- Example: inventory item links to purchase transaction
ALTER TABLE home_inventory ADD COLUMN purchase_transaction_id TEXT
  REFERENCES transactions(id) ON DELETE SET NULL;

-- Example: future media subscription links to finance recurring transaction
-- media_subscriptions.transaction_id REFERENCES transactions(id) ON DELETE SET NULL
```

**Rules:**
- Cross-domain FKs are always NULLABLE — the link is optional
- ON DELETE SET NULL — breaking a link doesn't cascade destruction
- ON UPDATE CASCADE — if an ID changes (unlikely with UUIDs), propagate
- All cross-domain FKs reference `id` (UUID), never other columns
- Document which domain "owns" each table — the owning domain manages the table's lifecycle

**Existing cross-domain link:** `home_inventory.purchase_transaction` already exists but is stored as a text field, not a proper FK. This should be formalised in a migration.

### R4: Schema Registry

A markdown document listing all tables, their owning domain, and cross-domain relationships. Lives at `docs/architecture/schema-registry.md`. Updated whenever a migration adds or removes tables.

```markdown
| Table | Domain | Description | Cross-domain FKs |
|-------|--------|-------------|------------------|
| entities | core | Merchants, people, places | — |
| transactions | finance | Ledger entries | entities.id |
| budgets | finance | Budget targets | — |
| wish_list | finance | Purchase goals | entities.id |
| home_inventory | inventory | Owned items | entities.id, transactions.id |
| ai_usage | core | AI API call tracking | — |
| transaction_corrections | core | ML correction learning | entities.id |
| schema_migrations | core | Migration tracking | — |
| environments | core | Test DB registry | — |
```

### R5: Table Naming Conventions

- Snake_case, plural for collections (`transactions`, `entities`, `budgets`)
- Domain prefix for new tables to avoid collisions: `media_movies`, `media_tv_shows`, `fitness_workouts`, `travel_trips`
- Core tables (entities, ai_usage, etc.) have no prefix — they're shared
- Existing finance tables (`transactions`, `budgets`, `wish_list`) keep their names — no prefix. They're already established and well-understood.

### R6: Existing Migration Cleanup

The current migration system uses sequential numbers (`007_`, `008_`, etc.) and `initializeSchema()` pre-marks them as applied for fresh databases. This pattern should be preserved:

- Existing migrations (007–011) keep their numbered names
- New migrations use timestamp-based names
- `initializeSchema()` updated to include the INCLUDED_MIGRATIONS array for any new migrations
- Document this dual approach so it's not confusing

## Out of Scope

- Creating schemas for new domains (media, fitness, etc.)
- Changing the database engine
- Multi-database setup
- Automated rollback tooling
- Data migration scripts for reclassifying entity types

## Acceptance Criteria

1. Migration naming convention documented and a template migration file exists
2. Entity table has a `type` column with supported values
3. Existing entities default to `company`
4. Cross-domain FK pattern documented with `home_inventory.purchase_transaction_id` formalised as a proper FK
5. Schema registry document created at `docs/architecture/schema-registry.md`
6. Table naming conventions documented
7. `initializeSchema()` updated to include new migrations
8. All existing data preserved — no destructive changes
9. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass
10. All API and E2E tests pass

## Edge Cases & Decisions

**Q: What if two agents create migrations at the same second?**
A: Extremely unlikely with timestamp precision to the second. If it happens, one agent renames theirs with a +1 second offset before merging. The migration runner applies them in filename sort order.

**Q: Should we enforce FK constraints at the SQLite level?**
A: Yes, but with `PRAGMA foreign_keys = ON` (SQLite has this off by default). Verify this is set in `db.ts`. Nullable FKs + SET NULL on delete gives us referential integrity without cascade risk.

**Q: What about the `notion_id` column on entities?**
A: It's nullable and legacy. Leave it for now. It can be dropped in a future cleanup migration when we're confident no import tooling references it.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Establish migration conventions and template
**As a** developer, **I want** documented migration conventions and a template file **so that** new domains can add tables consistently.

**Acceptance criteria:**
- Migration naming convention documented (timestamp-based)
- Template migration file created with header comment format and rollback section
- Dual approach (legacy numbered + new timestamped) documented
- `initializeSchema()` pattern documented for fresh databases

### US-2: Add entity type system
**As a** developer, **I want** entities to have a `type` column **so that** they can be distinguished across domains (company vs person vs place).

**Acceptance criteria:**
- Migration adds `type TEXT NOT NULL DEFAULT 'company'` to entities
- Entity service/router updated to accept and return `type`
- Zod schemas updated
- Entity API tests updated
- Existing entities default to `company`

### US-3: Formalise cross-domain FK patterns
**As a** developer, **I want** cross-domain foreign keys documented and the existing inventory→transaction link formalised **so that** new domains follow a consistent pattern.

**Acceptance criteria:**
- Cross-domain FK rules documented (nullable, SET NULL, UUID references)
- `home_inventory.purchase_transaction` converted to proper FK in a migration
- Schema registry created at `docs/architecture/schema-registry.md`
- Table naming conventions documented
