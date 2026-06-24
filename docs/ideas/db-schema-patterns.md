# DB schema patterns — unbuilt pieces

Spun off from PRD `db-schema-patterns`. The schema _conventions_ (per-pillar DB, migrations, pragmas, entity types, URI references, settings table) are built and shipped. These three pieces from the original spec are not, and the dead monolith assumptions they relied on are gone.

## Fleet-wide seed dataset

The original PRD wanted one comprehensive, deterministic seed dataset spanning every domain (entities, transactions, budgets, inventory, media…) loadable via `mise db:seed`, with `mise db:clear` to wipe-but-keep-schema, used to reset e2e state between runs.

That seeder lived in the deleted monolith and assumed a single shared `pops.db`. In the federated world there is no shared database to seed and no cross-domain seeder. The only surviving dev seeder is `mise db:seed:food`, which wipes and seeds **only** the food pillar's tables.

If wanted, the replacement is **per-pillar seeders**, not a global one:

- Each pillar ships its own `db:seed:<id>` (wipe its tables, insert deterministic fixtures into its own `.db`).
- An optional umbrella `db:seed` task fans out to every pillar's seeder.
- Deterministic fixtures (fixed UUIDs, fixed timestamps) so e2e snapshots are stable.
- Small enough to load fast; cross-pillar fixtures use URI strings, so a finance fixture can reference an inventory fixture by `pops://inventory/item/<fixed-uuid>` without the two seeders coordinating.

## `db:init` / `db:clear` lifecycle tasks

The PRD assumed `mise db:init` (create a fresh DB with all tables) and `mise db:clear` (truncate, keep schema). Neither exists — there is no `initializeSchema()` and no `INCLUDED_MIGRATIONS` array. Pillars create their schema by applying their migration journal on boot; a "fresh DB" is just an empty file the first boot migrates.

A federated equivalent, if desired, would be per-pillar: `db:clear:<id>` truncating that pillar's tables (preserving the journal + schema), with an umbrella that fans out. `db:init` is redundant — boot already does it.

## Reconciliation cron for `*_stale_at`

The `<thing>_stale_at` columns exist on cross-pillar references (`home_inventory.purchase_transaction_stale_at`, `home_inventory.owner_stale_at`, `budgets.owner_uri_stale_at`) and are nullable. The migration that adds them is shipped. The **cron that writes them** — periodically resolving each `<thing>_uri` against its owning pillar and stamping `stale_at` when the owner 404s — is owned by the cross-pillar-denorm PRD, not yet wired. Until it runs, the columns stay NULL and links are assumed live.
