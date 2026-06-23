# Plugin Architecture (Plexus)

> Epic: [07 — Plexus](../../epics/07-plexus.md)
> Status: Partial — adapter interface, lifecycle manager, ingestion filters, and the adapter/filter REST surface are live. There is no HTTP `register` endpoint and no `plexus.toml` registry / credential resolution / file-watcher; adapters are registered in-process out-of-band, so the REST surface runs over an empty registry until something registers an adapter. See [ideas/plexus-toml-registry.md](../../ideas/plexus-toml-registry.md).

Plexus is the cerebrum pillar's extension point for connecting to external data sources. Each adapter implements a standard TypeScript interface for ingesting external data into engrams (and optionally emitting outputs back out). This PRD owns the adapter contract, the in-process lifecycle manager, the ingestion-filter framework, and the REST surface that inspects and drives them. Adapter, filter, and lifecycle state live in the cerebrum pillar's own SQLite DB alongside engrams, plexus, glia, and conversations.

## Data Model (cerebrum SQLite)

**`plexus_adapters`** — one row per external integration.

| Column                      | Type    | Notes                                                                              |
| --------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `id`                        | TEXT PK | `plx_{name}`                                                                       |
| `name`                      | TEXT    | unique, human-readable (`email`, `github`)                                         |
| `status`                    | TEXT    | `registered` \| `initializing` \| `healthy` \| `degraded` \| `error` \| `shutdown` |
| `config`                    | TEXT    | JSON adapter settings (credentials excluded), passed through opaque                |
| `last_health`               | TEXT    | ISO 8601 of last successful health check                                           |
| `last_error`                | TEXT    | most recent error message                                                          |
| `ingested_count`            | INTEGER | total accepted items ingested via this adapter (default 0)                         |
| `emitted_count`             | INTEGER | total outputs emitted (default 0)                                                  |
| `created_at` / `updated_at` | TEXT    | ISO 8601                                                                           |

Indexes: unique on `name`, plus `status`.

**`plexus_filters`** — per-adapter include/exclude rules.

| Column        | Type    | Notes                                                          |
| ------------- | ------- | -------------------------------------------------------------- |
| `id`          | TEXT PK | `pxf_{adapterId}_{index}` (deterministic, order matches input) |
| `adapter_id`  | TEXT FK | → `plexus_adapters.id`, `ON DELETE CASCADE`                    |
| `filter_type` | TEXT    | `include` \| `exclude`                                         |
| `field`       | TEXT    | adapter-specific field name to match                           |
| `pattern`     | TEXT    | regex (anchored — full match unless `.*` is used)              |
| `enabled`     | INTEGER | 0/1, default 1                                                 |

Index: `adapter_id`.

- [x] Both tables exist with the columns and indexes above; deleting an adapter cascades its filters.

## REST API Surface

Served under the cerebrum ts-rest contract (`cerebrum.plexus.*`). Non-identity domain — no per-request auth (docker-network trust boundary, parity with templates).

| Method & path                                   | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `GET  /plexus/adapters`                         | List every adapter with status + config + ingestion counts          |
| `GET  /plexus/adapters/:adapterId`              | One adapter; 404 if missing                                         |
| `POST /plexus/adapters/:adapterId/health-check` | On-demand health check; returns `{ status, lastCheck, error? }`     |
| `POST /plexus/adapters/:adapterId/sync`         | Manual ingestion cycle; returns `{ ingested, filtered }`            |
| `POST /plexus/adapters/:adapterId/unregister`   | Shut down + remove adapter; returns `{ success }`                   |
| `GET  /plexus/adapters/:adapterId/filters`      | List the adapter's filters                                          |
| `POST /plexus/adapters/:adapterId/filters`      | Atomically replace all filters; 400 on bad regex, 404 if no adapter |

- [x] Lifecycle mutations (health-check / sync / unregister) and `filters.set` are POSTs with typed bodies; `unregister` is a POST sub-action, not DELETE, keeping verbs uniform.
- [x] `adapters.list` returns runtime state (status, `lastHealth`, `lastError`, counts) and config together.
- [x] `filters.set` is a full atomic replace (delete-then-insert in a transaction), not a merge.
- [x] Frontend admin: `/cerebrum/plexus` lists adapters with status, last-health, and counts; `/cerebrum/plexus/:adapterId` shows read-only config, last error, and the filter list, with health-check + sync actions.

There is no `register` endpoint — registration is in-process only (see Idea). There is no per-adapter config-editing endpoint; config is read-only on the wire.

## Adapter Contract

Every adapter implements `PlexusAdapterInterface<TSettings>` with `readonly name`, `readonly version`, and:
`initialize(config)`, `ingest(options) -> EngineData[]`, `healthCheck() -> AdapterStatus`, `shutdown()`, and optional `emit?(options, content)`.

- [x] `initialize`, `ingest`, `healthCheck`, `shutdown` are required; `emit` is optional. `callEmit()` rejects with `Adapter '{name}' does not support emit operations` when an adapter lacks `emit`.
- [x] `BaseAdapter` abstract class supplies defaults — `initialize` stores config, `healthCheck` returns `healthy`, `shutdown` is a no-op — so concrete adapters override only `ingest` (and `healthCheck`/`emit` as needed).
- [x] `EngineData` (the pre-engram structure fed to the ingestion pipeline): `body` (required), `source` (required, set to `plexus:{name}` by the lifecycle manager), optional `title`, `type`, `scopes`, `tags`, `customFields`, and `externalId` (original external ID for dedup independent of content-hash).
- [x] `AdapterConfig<TSettings>` = `{ name, credentials: Record<string,string> (resolved), settings: TSettings }`. `AdapterStatus` = `{ status: 'healthy'|'degraded'|'error', message?, lastChecked, metrics? }`. `IngestOptions` = `{ since?, limit?, filters? }`. `EmitOptions` = `{ target, format? }`. `EmitContent` = `{ title, body (Markdown), metadata? }`.

## Business Rules

- [x] Lifecycle: `register` upserts the row (status `registered`), optionally seeds filters, sets `initializing`, then awaits `adapter.initialize(config)` under a 10s timeout — success → `healthy` (+ `lastHealth` stamped), failure → `error` with the message in `last_error`. Only on success is the adapter added to the in-memory map and put on the health-check schedule.
- [x] Health-check loop: per-adapter timer fires every 5 minutes plus up-to-30s jitter (staggered to avoid burst load). A `healthy` result resets `consecutiveFailures` and clears error state. A single failure → `degraded`; three consecutive failures → `error`, at which point the adapter is removed from the active map (no further checks or syncs).
- [x] Health checks and `healthCheck()` calls race a 10s timeout; a timeout counts as a failure.
- [x] Error isolation: every adapter method call is wrapped in try/catch; an unhandled rejection is caught, recorded against that adapter, and transitions it to `error` without affecting other adapters.
- [x] `sync` rejects if the adapter is not active or is in `error` state; otherwise it calls `ingest({})`, stamps `source = plexus:{name}` on every item, applies enabled filters, increments `ingested_count` by the accepted count, and returns `{ ingested, filtered }`. An exception during `ingest` flips the adapter to `error`.
- [x] `shutdownAll` shuts every active adapter down in parallel under a 5s timeout each (abandoned past the timeout) and marks them `shutdown`.
- [x] `unregister` clears the adapter's health timer, best-effort `shutdown()` under 5s, removes it from the active map, and hard-deletes the row (filters cascade). Idempotent — deleting an already-gone id reports `success: false`/0 changes.

## Ingestion Filters

- [x] Filters compile once per evaluation; an invalid regex is dropped with a `[plexus] Invalid filter pattern ...` warning rather than aborting the batch. `filters.set` additionally rejects bad regex up front with a 400.
- [x] Evaluation order: if any `include` filters exist, an item must match at least one; then if any `exclude` filters exist, an item matching any is dropped. Exclude-only ⇒ everything passes except matches; include-only ⇒ only matches pass; no filters ⇒ everything passes.
- [x] Field extraction reads well-known scalar fields (`body`, `title`, `type`, `source`, `externalId`), joins array fields (`tags`, `scopes`) comma-separated, and falls back to `customFields[field]` so each adapter can expose its own filterable fields (e.g. email `subject`/`from`, github `event_type`/`repo`).
- [x] Filtered-out items are counted (the `filtered` count from `sync`) but never ingested. A `dryRun` path returns `{ wouldIngest, wouldFilter }` without writing.
- [x] Individual filters toggle via `enabled` without deletion; the ingest path reads only enabled filters.

## Edge Cases

- [x] `initialize` failure → status `error`, message in `last_error`, adapter not added to the active map, not available for sync.
- [x] Health check exceeding 10s → treated as a failure (counts toward `degraded`/`error`).
- [x] `emit` on an ingest-only adapter → rejects with `Adapter '{name}' does not support emit operations`.
- [x] Duplicate / cross-adapter content → not deduped here; both engrams are created (content-hash + `externalId` dedup is the ingestion pipeline's job).
- [x] `sync`/`filters.set` against a missing adapter → not-active error / 404; `filters.set` never orphans rows under a phantom id.

## Out of Scope

- Specific reference adapter implementations (email / github / calendar etc.) — separate PRD.
- `plexus.toml` registry, `env:` credential resolution, file-watcher reconciliation, `module: builtin:`/path resolution, and an HTTP `register` endpoint — captured in [ideas/plexus-toml-registry.md](../../ideas/plexus-toml-registry.md).
- OAuth consent flows (single-user); adapter marketplace/distribution; real-time streaming; per-adapter config-editing UI.
