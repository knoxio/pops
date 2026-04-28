# US-01: Adapter Interface

> PRD: [PRD-090: Plugin Architecture](README.md)
> Status: Done

## Description

As a developer building a Plexus adapter, I need a well-defined TypeScript interface that specifies the contract for ingestion, emission, and health checking so that adapters are interchangeable and the plugin system can manage them uniformly.

## Acceptance Criteria

- [x] A `PlexusAdapter` TypeScript interface is exported from a shared module with four required methods and one optional: `initialize(config: AdapterConfig): Promise<void>`, `ingest(options: IngestOptions): Promise<EngineData[]>`, `healthCheck(): Promise<AdapterStatus>`, `shutdown(): Promise<void>`, and optionally `emit?(options: EmitOptions, content: EmitContent): Promise<void>`. Calling `emit` on an adapter that does not implement it throws a descriptive error
- [x] `AdapterConfig` is a typed object containing: `name` (string), `credentials` (Record<string, string> — resolved from env vars), and an adapter-specific `settings` object (generic type parameter on the interface)
- [x] `EngineData` is a typed object containing: `body` (string, required), `title` (string, optional), `type` (string, optional), `scopes` (string array, optional), `tags` (string array, optional), `source` (string, required — must be `plexus:{adapter_name}`), `customFields` (Record<string, unknown>, optional), `externalId` (string, optional — original ID from the external system for deduplication)
- [x] `AdapterStatus` is a typed object containing: `status` (`'healthy' | 'degraded' | 'error'`), `message` (string, optional — human-readable status detail), `lastChecked` (ISO 8601 string), `metrics` (optional object with adapter-specific stats like connection pool size, API rate limit remaining)
- [x] `IngestOptions` contains: `since` (Date, optional — only fetch items newer than this timestamp), `limit` (number, optional — max items to return), `filters` (array of filter rules, resolved by the plugin system before calling the adapter)
- [x] `EmitOptions` contains: `target` (string — adapter-specific destination identifier), `format` (string, optional — output format preference)
- [x] `EmitContent` contains: `title` (string), `body` (string — Markdown), `metadata` (Record<string, unknown>, optional)
- [x] An abstract `BaseAdapter` class provides default implementations for `initialize` (stores config), `shutdown` (no-op), and `healthCheck` (returns healthy) — concrete adapters extend this and override as needed

## Notes

- The interface should be generic enough to support diverse adapters (email, calendar, GitHub, RSS, API endpoints) without adapter-specific concerns leaking into the contract.
- `EngineData` intentionally mirrors the ingestion pipeline's `IngestionRequest` (PRD-081) but omits fields that the pipeline infers (classification, entity extraction). The adapter provides what it knows; the pipeline fills in the rest.
- The `externalId` field on `EngineData` enables the ingestion pipeline to skip items already ingested from the same adapter — this is a different deduplication mechanism from the content-hash check (an email might have different content on re-fetch due to formatting changes but the same external ID).
- The `BaseAdapter` abstract class reduces boilerplate for simple adapters — most adapters will override `ingest` and `healthCheck` at minimum. Adapters that support output (e.g., email) additionally implement `emit()`.
