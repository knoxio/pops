# PRD-090: Plugin Architecture

> Epic: [07 — Plexus](../../epics/07-plexus.md)
> Status: Not started

## Overview

Define the Plexus adapter interface, plugin lifecycle system, plugin registry, and ingestion filter framework. Plexus is the extension point for connecting Cerebrum to external data sources and services. Each adapter implements a standard TypeScript interface for bidirectional data flow — ingesting data from external systems into engrams and emitting outputs to external systems. This PRD defines the contracts and infrastructure; PRD-091 implements the reference adapters.

## Data Model

### plexus_adapters (SQLite)

| Column         | Type    | Constraints        | Description                                                              |
| -------------- | ------- | ------------------ | ------------------------------------------------------------------------ |
| id             | TEXT    | PK                 | Adapter ID: `plx_{name}`                                                 |
| name           | TEXT    | NOT NULL, UNIQUE   | Human-readable adapter name (e.g., `email`, `github`)                    |
| status         | TEXT    | NOT NULL           | `registered`, `initializing`, `healthy`, `degraded`, `error`, `shutdown` |
| config         | TEXT    |                    | JSON — adapter-specific configuration (credentials excluded)             |
| last_health    | TEXT    |                    | ISO 8601 — last successful health check                                  |
| last_error     | TEXT    |                    | Most recent error message                                                |
| ingested_count | INTEGER | NOT NULL DEFAULT 0 | Total engrams ingested via this adapter                                  |
| emitted_count  | INTEGER | NOT NULL DEFAULT 0 | Total outputs emitted via this adapter                                   |
| created_at     | TEXT    | NOT NULL           | ISO 8601                                                                 |
| updated_at     | TEXT    | NOT NULL           | ISO 8601                                                                 |

**Indexes:** `name`, `status`

### plexus_filters (SQLite)

| Column      | Type    | Constraints                       | Description                                               |
| ----------- | ------- | --------------------------------- | --------------------------------------------------------- |
| id          | TEXT    | PK                                | Filter ID: `pxf_{adapter}_{index}`                        |
| adapter_id  | TEXT    | FK → plexus_adapters.id, NOT NULL | Parent adapter                                            |
| filter_type | TEXT    | NOT NULL                          | `include` or `exclude`                                    |
| field       | TEXT    | NOT NULL                          | Field to match (adapter-specific)                         |
| pattern     | TEXT    | NOT NULL                          | Regex pattern (anchored — full match unless `.*` is used) |
| enabled     | BOOLEAN | NOT NULL DEFAULT TRUE             | Whether this filter is active                             |

**Indexes:** `adapter_id`

## API Surface

| Procedure                              | Input                                  | Output                                   | Notes                                 |
| -------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `cerebrum.plexus.adapters.list`        | —                                      | `{ adapters: PlexusAdapter[] }`          | All registered adapters with status   |
| `cerebrum.plexus.adapters.get`         | adapterId: string                      | `{ adapter: PlexusAdapter }`             | Single adapter with config and stats  |
| `cerebrum.plexus.adapters.register`    | name, config                           | `{ adapter: PlexusAdapter }`             | Register and initialise a new adapter |
| `cerebrum.plexus.adapters.unregister`  | adapterId: string                      | `{ success: boolean }`                   | Shutdown and remove adapter           |
| `cerebrum.plexus.adapters.healthCheck` | adapterId: string                      | `{ status, lastCheck, error? }`          | Run health check on specific adapter  |
| `cerebrum.plexus.adapters.sync`        | adapterId: string                      | `{ ingested: number, filtered: number }` | Trigger manual sync for adapter       |
| `cerebrum.plexus.filters.list`         | adapterId: string                      | `{ filters: PlexusFilter[] }`            | List filters for an adapter           |
| `cerebrum.plexus.filters.set`          | adapterId, filters: FilterDefinition[] | `{ filters: PlexusFilter[] }`            | Replace all filters for an adapter    |

## Business Rules

- Every adapter implements the `PlexusAdapter` TypeScript interface: `initialize(config): Promise<void>`, `ingest(options): Promise<EngineData[]>`, `healthCheck(): Promise<AdapterStatus>`, `shutdown(): Promise<void>`. The `emit(options, content): Promise<void>` method is optional — only adapters that support output (e.g., email) implement it
- The `EngineData` return type from `ingest` is a pre-engram structure: `{ body: string, title?: string, type?: string, scopes?: string[], tags?: string[], source: string, customFields?: object }` — it is fed directly into the ingestion pipeline (PRD-081)
- Adapter lifecycle: `registered → initializing → healthy`. Health checks run periodically (configurable, default every 5 minutes). A failing health check transitions the adapter to `degraded` (intermittent failure) or `error` (persistent failure after 3 consecutive failures). An `error` adapter is disabled until manually re-initialized
- Error isolation is mandatory — one adapter crashing does not affect other adapters. Each adapter runs in its own BullMQ job context with error boundaries. Unhandled exceptions are caught, logged, and the adapter is transitioned to `error` status
- Adapter configuration is stored in `engrams/.config/plexus.toml` — one section per adapter with connection details and credentials. Credentials are stored as references to environment variables, never as plaintext in the TOML file
- Ingestion filters are evaluated before content enters the ingestion pipeline: `include` filters whitelist matching content, `exclude` filters blacklist matching content. If both include and exclude filters exist, includes are evaluated first (only included content is then checked against excludes)
- Adapters set the `source` field to `plexus:{adapter_name}` on all ingested data — this enables filtering by source in queries and scope rules
- Manual sync (`cerebrum.plexus.adapters.sync`) triggers an immediate ingestion cycle for the adapter, bypassing any schedule. Useful for testing and initial setup
- Adapters are opt-in — no adapter is enabled by default. The user must register and configure each adapter

## Edge Cases

| Case                                              | Behaviour                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Adapter initialization fails                      | Status set to `error`, error logged, adapter not available for sync           |
| Health check times out (>10s)                     | Treated as a failure — status transitions toward `degraded`/`error`           |
| Ingestion returns duplicate content               | Handled by the ingestion pipeline's content-hash deduplication (PRD-081)      |
| Adapter config references missing env variable    | Initialization fails with a clear error: "Environment variable X not found"   |
| plexus.toml parse error                           | No adapters loaded, error logged — system continues without adapters          |
| Adapter produces content with no scopes           | Ingestion pipeline's scope inference assigns scopes based on adapter defaults |
| Emit called on adapter that only supports ingest  | Returns an error: "Adapter {name} does not support emit operations"           |
| Two adapters produce content about the same event | Both engrams are created — deduplication is content-based, not event-based    |
| Adapter removed while sync is in progress         | Sync completes (job already running), adapter removed after completion        |

## User Stories

| #   | Story                                                 | Summary                                                                       | Status      | Parallelisable   |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-adapter-interface](us-01-adapter-interface.md) | TypeScript interface definition for PlexusAdapter with EngineData return type | Not started | No (first)       |
| 02  | [us-02-plugin-lifecycle](us-02-plugin-lifecycle.md)   | Register, initialize, health check, shutdown lifecycle with error isolation   | Not started | Blocked by us-01 |
| 03  | [us-03-plugin-registry](us-03-plugin-registry.md)     | plexus.toml configuration, adapter discovery, credential management           | Not started | Blocked by us-01 |
| 04  | [us-04-ingestion-filters](us-04-ingestion-filters.md) | Per-adapter include/exclude rules for filtering ingested content              | Not started | Yes              |

US-01 defines the interface that US-02 and US-03 depend on. US-04 (ingestion filters) is independent of the lifecycle and registry and can be built in parallel.

## Verification

- An adapter implementing the `PlexusAdapter` interface can be registered via `cerebrum.plexus.adapters.register` and appears in the adapter list with `healthy` status
- A registered adapter's `ingest()` method is called during sync, and the returned `EngineData[]` items are created as engrams via the ingestion pipeline
- Health checks run every 5 minutes and transition the adapter to `degraded` after a single failure and `error` after 3 consecutive failures
- An adapter that throws an unhandled exception is caught and transitions to `error` without affecting other adapters
- Ingestion filters exclude content matching the `exclude` pattern — filtered content is counted but not ingested
- Adapter credentials in `plexus.toml` reference environment variables, not plaintext secrets
- Unregistering an adapter calls `shutdown()` and removes it from the registry
- Manual sync via `cerebrum.plexus.adapters.sync` triggers immediate ingestion and returns counts

## Out of Scope

- Specific adapter implementations (PRD-091 — Core Integration Adapters)
- OAuth consent flows (single-user system — credentials are configured directly)
- Adapter marketplace or distribution (adapters are local TypeScript modules)
- Real-time streaming from external sources (adapters use poll-based or webhook-based sync)
- Adapter-specific UI configuration screens (configuration via plexus.toml)

## Drift Check

last checked: 2026-04-17
