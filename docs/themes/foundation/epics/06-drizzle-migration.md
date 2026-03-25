# Epic: Drizzle ORM Migration

**Theme:** Foundation
**Priority:** 6 (blocks all Phase 2 app development)
**Status:** Done

## Goal

Migrate from raw SQL with better-sqlite3 to Drizzle ORM (per [ADR-011](../../architecture/adr-011-drizzle-orm.md)). Define all existing tables as Drizzle schema files, rewrite finance service files to use the Drizzle query builder, and replace manual zod row schemas with Drizzle-inferred types. After this epic, every new domain module (media, inventory, fitness) uses Drizzle from day one.

## Why now?

Every Phase 2 PRD (Media PRD-007 through PRD-016, Inventory PRD-017 through PRD-023) specifies Drizzle schemas and query builder syntax. If Drizzle isn't adopted first, none of those PRDs can be implemented as written.

## Scope

### In scope

- Install `drizzle-orm` and `drizzle-kit` (dev)
- Create `apps/pops-api/src/db/schema/` directory with Drizzle schema files for all existing tables:
  - `transactions.ts`
  - `entities.ts`
  - `budgets.ts`
  - `inventory.ts` (current `home_inventory`)
  - `wishlist.ts`
  - `corrections.ts`
  - `ai-usage.ts`
  - `environments.ts`
  - `index.ts` (barrel re-export)
- Create `drizzle.config.ts` for SQLite + better-sqlite3
- Create a Drizzle baseline migration matching the current schema (so existing databases are recognised as up-to-date)
- Rewrite all finance service files (~8) to use Drizzle query builder instead of raw SQL:
  - `modules/core/entities/service.ts`
  - `modules/finance/transactions/service.ts`
  - `modules/finance/budgets/service.ts`
  - `modules/finance/wishlist/service.ts`
  - `modules/finance/imports/service.ts`
  - `modules/inventory/service.ts`
  - `modules/core/corrections/service.ts`
  - `modules/core/ai-usage/service.ts`
- Update `@pops/db-types`:
  - Replace zod row schemas with `InferSelectModel` / `InferInsertModel` from Drizzle
  - Keep zod input validation schemas (they validate user input, not row shapes)
- Update `db.ts` to export a Drizzle database instance
- Update the migration runner to use `drizzle-kit migrate` (or keep the existing runner and have Drizzle generate SQL migrations that the existing runner applies)
- Add `mise drizzle:generate` and `mise drizzle:migrate` tasks
- All existing tests must pass after the rewrite

### Out of scope

- Creating new domain schemas (media, inventory upgrade) — those are in their own PRDs
- Changing the database engine
- Async/promise-based queries (keep synchronous via better-sqlite3)

## Deliverables

1. `drizzle-orm` and `drizzle-kit` installed
2. Drizzle schema files for all existing tables
3. `drizzle.config.ts` configured
4. Baseline migration created (existing DB recognised as current)
5. All service files rewritten to Drizzle query builder
6. `@pops/db-types` updated with Drizzle-inferred types
7. `db.ts` exports Drizzle instance
8. Mise tasks for `drizzle:generate` and `drizzle:migrate`
9. All existing tests pass
10. `pnpm typecheck` passes across all packages
11. `pnpm build` succeeds

## Dependencies

- Foundation Epics 0-5 (all complete or nearly complete)

## Risks

- **Service rewrite scope** — ~8 service files to rewrite. Each is bounded (replace SQL strings with Drizzle calls), but it's real work. Mitigation: one service at a time, verify tests pass after each.
- **Migration system transition** — Moving from hand-written migrations tracked in `schema_migrations` to Drizzle-managed migrations needs careful handling. Mitigation: create a baseline that matches the current schema, mark all existing migrations as applied.
- **Sync mode** — Drizzle supports both sync and async. better-sqlite3 is synchronous. Must use Drizzle's sync SQLite adapter. Mitigation: Drizzle's `drizzle-orm/better-sqlite3` adapter handles this natively.
