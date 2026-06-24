# Database Operations — deferred safety mechanisms

Deferred from [PRD Database Operations](../themes/platform/prds/database-operations/README.md). The per-pillar architecture obsoleted some monolith-era safety mechanisms and has not yet rebuilt others. The built lifecycle (per-pillar opener, Drizzle journal, path resolution, Litestream backup) lives in the PRD; everything here is not-yet-built.

## 1. Pre-migration snapshot + auto-restore

**Not built.** The original design called for a consistent SQLite snapshot taken immediately before applying pending migrations, deleted on success and preserved on failure, with automatic restore on a failed migration.

Today the opener applies migrations directly via drizzle's `migrate()`. Offsite durability comes from Litestream's continuous streaming, not a per-startup snapshot. A failed migration leaves the database in whatever state the failing statement reached (SQLite rolls back the individual failing statement's transaction, but multi-statement journals are not atomic across files).

If rebuilt per pillar, the opener would:

- Detect pending journal entries before applying (compare `meta/_journal.json` against `__drizzle_migrations`).
- Skip the snapshot when the database is fresh/empty or has no pending migrations.
- Snapshot via `VACUUM INTO {path}.pre-migration-{timestamp}.bak` (consistent even with uncommitted WAL pages; requires SQLite 3.27+), falling back to `PRAGMA wal_checkpoint(TRUNCATE)` + file copy.
- Delete the snapshot on full success; preserve it and log its path on failure.
- Log: `[db] Backing up before applying N migration(s)...` and `[db] All migrations applied. Backup removed.`

Acceptance criteria (from former US-03):

- [ ] Snapshot created before applying pending migrations, skipped when none pending or DB empty.
- [ ] Snapshot uses `VACUUM INTO` (or checkpoint + copy fallback) for a consistent point.
- [ ] Snapshot deleted on success, preserved + path logged on failure.
- [ ] Tests: backup created when pending, deleted on success, preserved on failure, skipped when none pending.

## 2. Full production guards on destructive commands

**Partial.** Today only the food pillar's dev seeder refuses to run when `NODE_ENV=production`. The original design wanted a uniform, stronger guard on every destructive command.

There is no global `db:init`/`db:seed`/`db:clear` anymore — destructive tooling is pillar-scoped — so any guard must be a shared helper each pillar's seed/reset script calls.

Missing pieces:

- A data-presence heuristic (e.g. finance refuses when its `transactions` table is non-empty, regardless of `NODE_ENV`) so an imported real dataset is treated as production even outside prod env.
- A `--force` / `FORCE=true` escape hatch for deliberate dev resets, printing a warning before proceeding.
- Specific error messages: what was detected and what to do instead.
- A shared guard module so each pillar's script gets identical behaviour rather than ad-hoc per-pillar copies.

Acceptance criteria (from former US-02):

- [ ] Destructive pillar scripts refuse to run when `NODE_ENV=production`.
- [ ] Destructive pillar scripts refuse when the pillar's key table contains real data, with an explanatory message.
- [ ] `FORCE=true` bypasses the guard but prints a warning first.
- [ ] Shared guard helper reused across pillars (no per-pillar copy-paste).
- [ ] Tests: guard triggers on prod env, triggers on non-empty data table, `--force` bypasses with warning, passes on empty dev DB.

## 3. Migration data-safety CI test

**Not built.** No test seeds a database, runs the full migration chain, and verifies data integrity (row counts unchanged, column values intact, FK relationships valid, JSON columns still parse). Pillars test their own schema, but nothing exercises a migrated-with-data path as a regression gate.

If built, it would be per pillar (there is no global schema to test): seed representative rows into the pillar's key tables, apply the pillar's full journal, then assert integrity. Runs in CI on any PR touching that pillar's `src/db/schema/` or `migrations/`.

Acceptance criteria (from former US-04):

- [ ] Test seeds representative data into a pillar's key tables (FKs, JSON columns).
- [ ] Test applies the pillar's full migration journal.
- [ ] Test verifies row counts unchanged, column values intact, FKs valid, JSON parses.
- [ ] Test runs in CI on PRs touching that pillar's schema or migrations.
- [ ] Test fails with a clear message when a migration drops rows, nullifies columns, or breaks FKs.
- [ ] Covers an added-column migration (existing rows get the default) and a renamed-column migration (data preserved under the new name).

## 4. Per-pillar go-live runbook

**Not built (current version).** `docs/runbooks/DEPRECATED_go-live.md` describes the monolith flow (single `pops.db`, `mise db:init`, shared guards) and no longer applies. A greenfield runbook for the per-pillar fleet would cover, for each pillar going live:

- Prerequisites: Litestream stream configured and a restore drill exercised; migrations apply cleanly to a seeded test DB; `.env`/secrets present on the host.
- Initial data import per pillar (which import endpoints/scripts, in what order).
- Verification: row-count and spot-check per pillar.
- Point of no return: stop running any destructive script against that pillar's database.
- Ongoing schema changes: edit schema → `drizzle-kit generate` → review → commit → deploy → auto-migrate on startup.
- Emergency recovery: per-pillar Litestream restore (stop the container, `litestream restore`, restart), referencing the homelab-infra recovery procedure.
- A safe vs destructive command reference table, scoped per pillar.

Acceptance criteria (from former US-05):

- [ ] Runbook exists in the repo (readable when the fleet is down).
- [ ] Covers prerequisites, per-pillar import, verification, point of no return, ongoing schema changes, emergency recovery.
- [ ] Includes a safe vs destructive command reference table.
- [ ] Linked from a discoverable place (root `AGENTS.md` / docs index) so agents find it.
