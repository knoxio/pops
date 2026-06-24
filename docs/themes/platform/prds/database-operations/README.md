# Database Operations

> Theme: [Platform](../../README.md)
> Status: Done

## Overview

Each pillar owns its own SQLite database and applies its own committed migration journal at startup. There is no shared database, no global init/seed/clear, and no second migration system. Schema changes flow through Drizzle per pillar: edit the pillar's schema, generate a migration, review the SQL, commit it, deploy — the pillar auto-migrates its own file on boot. Backups are per-pillar continuous streams, independent of every other pillar.

This PRD specifies the database lifecycle that every pillar implements identically: how a database is opened, how migrations are applied and journaled, where the SQLite file lives, and how a pillar's data is replicated offsite.

## Data Model

There is no global schema. Each pillar defines its own tables in `pillars/<id>/src/db/schema/` (drizzle-orm `sqliteTable` definitions) and owns a private SQLite file. A pillar never reads or writes another pillar's database — cross-pillar data flows over REST, never over a shared file handle.

Drizzle tracks applied migrations inside each database in its own `__drizzle_migrations` table, keyed by a content hash. The committed journal lives at `pillars/<id>/migrations/` (`*.sql` files plus a `meta/_journal.json` index produced by `drizzle-kit generate`).

| Artifact                                     | Owner   | Purpose                                                        |
| -------------------------------------------- | ------- | -------------------------------------------------------------- |
| `pillars/<id>/src/db/schema/*.ts`            | pillar  | Drizzle table definitions — the source of truth for the schema |
| `pillars/<id>/migrations/*.sql`              | pillar  | Generated, committed migration journal                         |
| `pillars/<id>/migrations/meta/_journal.json` | pillar  | Drizzle journal index (apply order + hashes)                   |
| `__drizzle_migrations` (in the DB file)      | runtime | Per-database record of which journal entries have been applied |
| `infra/litestream/<id>.yml`                  | infra   | Per-pillar continuous replication config (offsite backup)      |

## The Opener Contract

Every pillar exposes a standalone `open<X>Db(path)` in `pillars/<id>/src/db/open-<id>-db.ts`. The pillar's HTTP server wires this up at boot, resolving the path first (see below) and passing it in. The opener is uniform across pillars:

1. `mkdirSync(dirname(path), { recursive: true })` — create the parent directory if missing.
2. Open the file with `better-sqlite3`.
3. Apply pragmas: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
4. Wrap in a drizzle handle.
5. `migrate(db, { migrationsFolder })` against the in-package `migrations/` directory (resolved relative to the module via `import.meta.url`, so it works both through the workspace symlink and bundled into a Docker image's `node_modules/@pops/<id>/`).
6. On migration error, close the raw handle before re-throwing — never leak a locked file descriptor.

The opener returns both the drizzle wrapper (`db`) and the raw `better-sqlite3` handle (`raw`, for shutdown/pragmas the wrapper hides).

Drizzle's `migrate()` is idempotent: re-running against an already-current database short-circuits on the `__drizzle_migrations` hash check, so startup is safe to repeat. A fresh database is created and brought fully up to date on first boot.

## SQLite Path Resolution

Each pillar resolves its file path with a standalone `resolve<X>SqlitePath()` (in `pillars/<id>/src/api/<id>-sqlite-path.ts`), runnable without any other pillar in the dependency graph. The precedence chain is uniform:

1. `<ID>_SQLITE_PATH` (pillar-specific env var, absolute or relative) — wins if set.
2. `<dirname(SQLITE_PATH)>/<id>.db` — if the shared `SQLITE_PATH` legacy contract is set, the pillar's file lives next to it under the pillar's own name.
3. `./data/<id>.db` — the sane default. No placeholder, no junk-file path; a missing env var produces a real file at a predictable location, not a literal placeholder string.

This guarantees a deployer who only sets `SQLITE_PATH` still gets each pillar in its own file (`finance.db`, `registry.db`, …) rather than a collision on one shared file.

## Schema Change Workflow

Schema changes go through Drizzle, per pillar:

1. Edit the pillar's schema in `pillars/<id>/src/db/schema/`.
2. Run `drizzle-kit generate` for that pillar — produces a numbered `*.sql` migration plus a `meta/_journal.json` update.
3. Review the generated SQL.
4. Commit the schema change and the generated migration together.
5. Deploy — the pillar auto-migrates its own database on the next startup.

A baseline migration (e.g. finance's `0053_finance_pillar_baseline`, inventory's `0006_inventory_pillar_baseline`) provisions a pillar's core tables, and replaying the journal in full from its first entry brings a fresh database fully up to date with no out-of-band bootstrap step.

## Backup

Each pillar streams its SQLite file offsite continuously via Litestream. `infra/litestream/<id>.yml` is the canonical reference the deployer copies into its own Litestream config; the replica target (bucket, region, credentials) comes from the deployer's environment as a `${<ID>_LITESTREAM_REPLICA_URL}` placeholder. Per-pillar configs mean a single-pillar restore never pulls the whole fleet's data. Production provisioning (ansible, secrets, the actual replica credentials) lives in private [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra); day-to-day rollouts are handled by Watchtower.

Restore is per-pillar: stop the pillar's container so it isn't writing, then `litestream restore -o /data/sqlite/<id>.db "${<ID>_LITESTREAM_REPLICA_URL}"`.

## Rules

- One migration system: Drizzle, per pillar. No manual `runMigrations()`, no second journal, no shared `pops.db`.
- A pillar applies only its own migrations and owns only its own file. No pillar touches another's database.
- Migrations are applied at boot by the opener, idempotently. A re-deploy that finds the database already current is a no-op.
- The SQLite path always resolves to a real, predictable location — never a placeholder.
- Destructive database commands (seed/clear/reset) are dev/test only and must never run in production. There is no global init/seed/clear; any such tooling is pillar-scoped.
- Schema changes are committed as schema + generated migration together. A schema edit without its generated migration is incomplete.
- Each pillar backs up independently via its Litestream stream. There is no single database to back up.

## Edge Cases

| Case                                                 | Behaviour                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Fresh database (file absent)                         | Parent dir created, file created, full journal applied from its first entry                  |
| Database already current                             | `migrate()` short-circuits on the hash check; boot proceeds with no schema writes            |
| Migration apply throws (corrupt DB / bad SQL)        | Raw handle closed before re-throw; the pillar fails to start rather than leaking the lock    |
| `SQLITE_PATH` set but no pillar-specific var         | Pillar file resolves to `<dirname(SQLITE_PATH)>/<id>.db` — never collides on the shared file |
| No env vars set at all                               | Falls back to `./data/<id>.db`                                                               |
| Seed/reset script invoked with `NODE_ENV=production` | Script refuses to run and exits with an explanatory error (food pillar's dev seeder)         |
| Single-pillar data loss                              | Restore that pillar alone from its Litestream replica; other pillars are untouched           |

## Acceptance Criteria

- [x] Each pillar opens its own SQLite file via a standalone `open<X>Db(path)` that sets WAL + `foreign_keys` + `busy_timeout` pragmas and applies its in-package migration journal via drizzle's `migrate()`.
- [x] The opener resolves the migrations folder relative to its own module (`import.meta.url`) so it works through the workspace symlink and bundled into a Docker image.
- [x] The opener closes the raw handle on migration failure before re-throwing (no leaked locked file descriptor).
- [x] Drizzle's `migrate()` is idempotent — re-running against a current database is a no-op via the `__drizzle_migrations` hash check.
- [x] A fresh database is fully provisioned by replaying the pillar's journal in full (a baseline migration provisions the pillar's core tables).
- [x] Each pillar resolves its SQLite path via a standalone `resolve<X>SqlitePath()` with precedence `<ID>_SQLITE_PATH` → `<dirname(SQLITE_PATH)>/<id>.db` → `./data/<id>.db`. No placeholder paths.
- [x] Drizzle is the only migration system: no manual SQL runner, no shared `pops.db`, no second journal table.
- [x] Schema-change workflow is documented in `AGENTS.md`: edit schema → `drizzle-kit generate` → review → commit → deploy → auto-migrate on startup.
- [x] Each pillar has a Litestream replication config at `infra/litestream/<id>.yml` for independent offsite backup.
- [x] Dev seed/reset tooling is pillar-scoped and refuses to run when `NODE_ENV=production`.

## Out of Scope

- A shared/global database, global init/seed/clear, or a second migration system — these belonged to the decommissioned monolith.
- Drizzle ORM adoption for query code (separate concern).
- Schema design conventions (separate concern).
- Point-in-time recovery beyond Litestream's snapshot/retention windows.
- Database replication or read replicas.
- Automated rollback of Drizzle migrations — Drizzle has no down migrations; recover by restoring from the Litestream replica.

## Deferred

The original PRD specified several monolith-era safety mechanisms that the per-pillar architecture either obsoleted or has not yet rebuilt. They are tracked in [docs/ideas/database-operations.md](../../../../ideas/database-operations.md):

- Pre-migration snapshot + auto-restore (VACUUM INTO before applying, restore on failure) — not built; Litestream provides continuous streaming, not a per-startup snapshot.
- Full production guards on destructive commands (transaction-count heuristic, `--force` escape hatch, shared guard across all pillars) — only a partial `NODE_ENV` guard exists today.
- Migration data-safety CI test (seed → migrate → verify row counts / FKs / JSON intact) — not built.
- A current per-pillar go-live runbook — the monolith-era runbook is deprecated.
