# Manual SQL Migrations — FROZEN

**Do not add new `.sql` files to this directory.**

As of March 2026, all schema changes go through Drizzle:

1. Edit the schema in `packages/db-types/src/schema/`
2. Run `mise drizzle:generate`
3. Review the generated SQL in `src/db/drizzle-migrations/`
4. Commit both the schema change and the migration

Existing migrations in this directory are preserved for backward compatibility.
The `runMigrations()` function in `db.ts` still applies them to databases that
haven't seen them yet, but no new migrations should be added here.

A CI check enforces this — PRs that add `.sql` files to this directory will fail.

See [PRD-060 US-01](../../../../../docs/themes/00-platform/prds/060-database-operations/us-01-unify-migrations.md) for context.
