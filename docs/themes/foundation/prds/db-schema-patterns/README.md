# DB Schema Patterns

> Theme: [Foundation](../../README.md) · Epic: [DB Schema Patterns](../../epics/db-schema-patterns.md)
> Status: Done

The database conventions every pillar follows. Each pillar owns its **own** SQLite database — there is no shared `pops.db`, no central schema, no monolith. A pillar's schema is private to that pillar; cross-pillar references are URI strings, not foreign keys. After this PRD, a new pillar can stand up a database that participates in the fleet without coordinating a global migration.

## Model

```
pillar (TS)                          pillar (Rust)
  └─ <id>.db (SQLite, WAL)             └─ <id>.db (SQLite, WAL)
       ├─ Drizzle table defs               ├─ sqlx FromRow structs
       ├─ migrations/*.sql                 ├─ migrations/*.sql
       │   + meta/_journal.json            └─ sqlx::migrate!("./migrations")
       └─ drizzle migrator on boot
```

- **One database per pillar.** Path comes from a per-pillar env var: `FINANCE_SQLITE_PATH`, `CONTACTS_SQLITE_PATH`, `INVENTORY_SQLITE_PATH`, `MEDIA_SQLITE_PATH`, `FOOD_SQLITE_PATH`, `LISTS_SQLITE_PATH`, `AI_SQLITE_PATH`, `CEREBRUM_SQLITE_PATH`, `REGISTRY_SQLITE_PATH`. In the fleet each resolves to a distinct file under `/data/sqlite/<id>.db`.
- **SQLite is the source of truth** for that pillar — one file, no external dependency.
- A pillar opens its database, applies its committed migration journal, and starts serving. Migrations run on boot; the apply is idempotent (re-running against an up-to-date DB is a no-op).

## Connection pragmas

Every pillar database connection — TS or Rust, file-backed or in-memory — is opened with the same three pragmas:

| Pragma         | Value     | Why                                                                                        |
| -------------- | --------- | ------------------------------------------------------------------------------------------ |
| `journal_mode` | `WAL`     | Concurrent readers don't block the writer; Litestream replicates the WAL                   |
| `foreign_keys` | `ON`      | SQLite defaults this **off** — within-pillar FKs are only enforced when explicitly enabled |
| `busy_timeout` | `5000` ms | Concurrent writers retry rather than erroring on a locked file                             |

In-memory databases (`:memory:` / `mode=memory`, used in tests) are capped to a single connection in the Rust pillars — each in-memory connection is an isolated database, so a multi-connection pool would hand out connections that never saw the migrations.

## Migrations

Two runners, one shape: numbered SQL files applied in order, with a recorded ledger so already-applied files short-circuit.

### TypeScript pillars (Drizzle)

- Migrations live in a flat `pillars/<id>/migrations/` directory: `NNNN_slug.sql` (e.g. `0056_settings_baseline.sql`).
- An ordered `migrations/meta/_journal.json` lists every migration by `idx` and `tag`. Drizzle's `better-sqlite3` migrator applies them on boot and records each hash in `__drizzle_migrations`; re-running against the same DB short-circuits on the hash check.
- Each file uses `--> statement-breakpoint` between statements. Drizzle wraps each migration's apply.
- **Self-bootstrapping baseline.** The first journal entry (e.g. `0053_finance_pillar_baseline`) `CREATE`s the tables that the older numbered migrations `ALTER`. Against a fresh per-pillar `.db` the baseline runs first so the later `ALTER`s have their target tables; this lets a pillar's journal stand alone without depending on any pre-existing schema. (Mirrors `0006_inventory_pillar_baseline`.)

### Rust pillars (sqlx)

- Migrations live in `pillars/<id>/migrations/`: `NNNN_slug.sql` (e.g. `0002_entities.sql`).
- A `static MIGRATOR = sqlx::migrate!("./migrations")` embeds the journal at compile time; `MIGRATOR.run(&pool)` applies it on boot and in tests so the in-memory and on-disk schemas are identical.

### Rules

- **Forward-only.** Never edit an applied migration — add a new one.
- **Additive.** Add columns, don't drop them. Destructive changes are rejected at review.
- **Idempotent where it matters.** `CREATE … IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for statements that may co-exist with a self-bootstrapping baseline.
- **Domain by directory.** A pillar's migrations live in that pillar; there is no global migration directory and no filename domain-prefix scheme.
- Rollback is not automated — undo is a new forward migration.

## Table & column conventions

| Convention   | Rule                                                                 | Examples                                           |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------- |
| Table names  | snake_case, plural                                                   | `transactions`, `budgets`, `home_inventory`        |
| Column names | snake_case                                                           | `last_edited_time`, `entity_id`, `owner_uri`       |
| FK columns   | `<target>_id` (within-pillar), `<thing>_uri` (cross-pillar)          | `season_id`, `purchase_transaction_uri`            |
| Index names  | `idx_<table>_<column>`                                               | `idx_transactions_date`, `idx_inventory_owner_uri` |
| Timestamps   | `created_at TEXT DEFAULT (datetime('now'))`, `last_edited_time TEXT` | ISO-8601 strings                                   |

### Primary key types

| Style             | Used by                                | Why                                                                                      |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `TEXT` (UUID)     | finance, contacts, inventory, lists, … | `crypto.randomUUID()` / UUID; stable, portable, referenceable from other pillars via URI |
| `INTEGER` (rowid) | media internals, join/photo tables     | Internal-only data; external IDs (`tmdb_id`, `tvdb_id`) stored in separate columns       |

TS pillars use Drizzle's `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`.

## Entity types

Entities (contacts) carry a `type` discriminator. The canonical set is **owned by the contacts pillar** (`pillars/contacts/src/entities/model.rs`) and mirrored byte-for-byte as a finance-local enum and in `@pops/db-types` constants for browser-safe consumers:

```
company · person · government · bank · place · brand · organisation
```

- Default is `company` — most entities are merchants.
- Stored verbatim as the `type` column; validation happens at the route boundary, not the DB layer.
- Extended by adding a value to the set, never by a schema change. A single column, not a tags table — an entity is primarily one thing.

## Cross-pillar references (URI, not FK)

Foreign keys never cross a pillar boundary — a pillar cannot `REFERENCES` a table it doesn't own, and each pillar has its own database file. Cross-pillar links are stored as **URI strings** per [ADR-012](../../../../architecture/adr-012-universal-object-uri.md):

```
pops://<domain>/<type>/<id>      e.g.  pops://finance/transaction/<uuid>
```

Each soft reference is a column pair:

| Column                              | Meaning                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `<thing>_uri` (TEXT, nullable)      | The URI of the referenced object in the owning pillar                                                |
| `<thing>_stale_at` (TEXT, nullable) | Set when the owning pillar reports the URI no longer resolves — the row is kept, the link is flagged |

- Always **nullable** — the link is optional; a null URI is a valid state.
- No cascade, no DB-level enforcement — the owning pillar is the only authority on whether the target still exists.
- Indexed (`idx_<table>_<thing>_uri`) so reconciliation can scan by URI.
- Real, in-pillar examples: `home_inventory.purchase_transaction_uri` (→ finance), `home_inventory.owner_uri`, `budgets.owner_uri`. Migrations backfill the URI column from any legacy `<thing>_id` join column where one existed.

## Within-pillar foreign keys

Inside a single pillar's database, real FKs are used and enforced (`PRAGMA foreign_keys = ON`):

| Pattern                          | On Delete  | On Update | Example                                          |
| -------------------------------- | ---------- | --------- | ------------------------------------------------ |
| Optional link to a sibling table | `SET NULL` | no action | `transaction_corrections.entity_id` → `entities` |
| Owned child rows                 | `CASCADE`  | —         | `item_photos.item_id`, `seasons.tv_show_id`      |

## Settings table

Every pillar mounts the **same** flat key/value `settings` table in its own database — a federated shape shared via the `@pops/pillar-settings` TS package and the `pops-settings` Rust crate. There is no owner/namespace column: a pillar's table only ever holds that pillar's declared keys.

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Created per-pillar by a `NNNN_settings_baseline.sql` migration. The federated Read/Update/Reset surface (PRD settings-system) operates over this table; this PRD only owns its existence and shape.

**Secrets vs settings:**

- **Secrets** (env / Docker secrets): infrastructure-level, static per deployment — API keys, the per-pillar `*_SQLITE_PATH`. Never in the database.
- **Settings** (DB): user-specific or dynamic — tokens, URLs, sync timestamps, UI preferences. Never in env files.

## Rules

- One SQLite file per pillar; that file is the pillar's source of truth.
- `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` on every connection.
- Parameterised queries only — no string interpolation into SQL.
- Migrations are forward-only and additive; never edit an applied file.
- Cross-pillar links are nullable URI strings with a `*_stale_at` companion, never SQL foreign keys.
- New tables follow the naming conventions — enforced by review.

## Edge cases

| Case                                      | Behaviour                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Fresh per-pillar `.db` on first boot      | Self-bootstrapping baseline runs first, then later migrations; pillar serves once the journal is applied           |
| Re-running migrations on an up-to-date DB | No-op — drizzle short-circuits on the `__drizzle_migrations` hash; sqlx skips applied versions                     |
| In-memory DB in tests (Rust)              | Pool capped to one connection, or pooled queries race an unmigrated schema                                         |
| Cross-pillar target deleted               | Owning pillar 404s the URI; reconciliation sets `<thing>_stale_at`, the row and URI are kept                       |
| Legacy `notion_id` columns                | Nullable, preserved, `UNIQUE`; a remnant of the import era, dropped in a future cleanup when nothing references it |
| Two migrations collide on a number        | Renumber one (next free `NNNN`) and re-tag in `meta/_journal.json`; runner applies in journal order                |

## Acceptance Criteria

### Migrations

- [x] TS pillars apply numbered `migrations/*.sql` via the Drizzle `better-sqlite3` migrator from an ordered `meta/_journal.json` on boot
- [x] Rust pillars apply numbered `migrations/*.sql` via `sqlx::migrate!("./migrations")` on boot and in tests
- [x] Re-applying an up-to-date journal is a no-op (hash/version short-circuit)
- [x] Each pillar's journal is self-bootstrapping against a fresh per-pillar `.db` (baseline `CREATE`s before later `ALTER`s)
- [x] Migrations are forward-only and additive (enforced by review)

### Connection

- [x] `foreign_keys = ON` on every pillar connection (asserted in contacts' DB tests)
- [x] `journal_mode = WAL` and `busy_timeout = 5000` set on every pillar connection
- [x] In-memory pools are capped to one connection in Rust pillars

### Schema conventions

- [x] Entity `type` discriminator with values `company, person, government, bank, place, brand, organisation`, default `company`, owned by contacts and mirrored in `@pops/db-types`
- [x] UUID `TEXT` PKs for cross-referenceable pillars; `INTEGER` PKs for media internals
- [x] snake*case plural table names, `idx*<table>\_<column>`index names,`<target>\_id` within-pillar FK columns
- [x] Within-pillar FKs use `SET NULL` for optional links and `CASCADE` for owned children

### Cross-pillar references

- [x] Cross-pillar links stored as nullable `pops://domain/type/id` URI strings, never SQL foreign keys ([ADR-012](../../../../architecture/adr-012-universal-object-uri.md))
- [x] Each soft reference carries a `<thing>_stale_at` companion column and a `idx_<table>_<thing>_uri` index
- [x] Migrations backfill the URI column from any legacy `<thing>_id` join column

### Settings

- [x] Each pillar mounts the shared flat `settings` (`key TEXT PRIMARY KEY, value TEXT NOT NULL`) table in its own DB via `@pops/pillar-settings`
- [x] Secrets-vs-settings boundary documented (secrets in env, settings in DB)

> Not in this PRD: a fleet-wide seed dataset and the cron that writes `*_stale_at`. See [docs/ideas/db-schema-patterns.md](../../../../ideas/db-schema-patterns.md).
