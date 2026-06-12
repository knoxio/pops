/**
 * Plexus type definitions (PRD-090).
 *
 * Core types for the plugin architecture: adapter interface, engine data,
 * health status, configuration, and filter definitions.
 */

// ---------------------------------------------------------------------------
// Adapter status
// ---------------------------------------------------------------------------

export const ADAPTER_STATUSES = [
  'registered',
  'initializing',
  'healthy',
  'degraded',
  'error',
  'shutdown',
] as const;
export type AdapterStatusValue = (typeof ADAPTER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Engine data — pre-engram structure yielded by adapters
// ---------------------------------------------------------------------------

/**
 * Content produced by an adapter's `ingest()` method. Passed directly into the
 * ingestion pipeline (PRD-081). The adapter provides what it knows; the pipeline
 * fills in classification, entity extraction, and scope inference.
 */
export interface EngineData {
  /** Main content body (Markdown or plain text). */
  body: string;
  /** Human-readable title. */
  title?: string;
  /** Content type hint (e.g. `email`, `issue`, `event`). */
  type?: string;
  /** Explicit scope paths. */
  scopes?: string[];
  /** Tag strings. */
  tags?: string[];
  /**
   * Source identifier. Must be `plexus:{adapter_name}` — set automatically by
   * the lifecycle manager so adapters don't need to hard-code it.
   */
  source: string;
  /** Adapter-specific metadata. */
  customFields?: Record<string, unknown>;
  /**
   * Original ID from the external system. Enables deduplication independent of
   * content-hash (an email might change formatting on re-fetch but keep the
   * same external ID).
   */
  externalId?: string;
}

// ---------------------------------------------------------------------------
// Adapter health
// ---------------------------------------------------------------------------

export interface AdapterStatus {
  status: 'healthy' | 'degraded' | 'error';
  /** Human-readable detail. */
  message?: string;
  /** ISO 8601 timestamp of the check. */
  lastChecked: string;
  /** Adapter-specific metrics (connection pool size, rate-limit remaining, etc.). */
  metrics?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter config
// ---------------------------------------------------------------------------

/**
 * Configuration passed to `adapter.initialize()`.
 * @template TSettings Adapter-specific settings shape.
 */
export interface AdapterConfig<TSettings = Record<string, unknown>> {
  /** Adapter name (matches the key in `plexus.toml`). */
  name: string;
  /** Resolved credentials (env var references already replaced with values). */
  credentials: Record<string, string>;
  /** Adapter-specific configuration. */
  settings: TSettings;
}

// ---------------------------------------------------------------------------
// Ingest / emit options
// ---------------------------------------------------------------------------

export interface IngestOptions {
  /** Only fetch items newer than this timestamp. */
  since?: Date;
  /** Max items to return. */
  limit?: number;
  /** Pre-resolved filter rules (evaluated by the plugin system). */
  filters?: FilterRule[];
}

export interface EmitOptions {
  /** Adapter-specific destination identifier. */
  target: string;
  /** Output format preference. */
  format?: string;
}

export interface EmitContent {
  title: string;
  /** Markdown body. */
  body: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

export type FilterType = 'include' | 'exclude';

export interface FilterRule {
  filterType: FilterType;
  /** Field name to match against (adapter-specific). */
  field: string;
  /** Regex pattern (anchored — full match unless `.*` is used). */
  pattern: string;
  enabled: boolean;
}

export interface FilterDefinition {
  filterType: FilterType;
  field: string;
  pattern: string;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Row + API shapes for adapters and filters now live in `@pops/cerebrum-db`
// (`PlexusAdapter`, `PlexusFilter`, `PlexusAdapterRow`, `PlexusFilterRow`).
// PRD-180 PR3 moved the data-access seam there; this module no longer
// re-exports its own copies.
// ---------------------------------------------------------------------------
// TOML config shape
// ---------------------------------------------------------------------------

export interface TomlAdapterConfig {
  module: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string>;
  filters?: Array<{
    type: FilterType;
    field: string;
    pattern: string;
  }>;
}

export interface PlexusToml {
  adapters?: Record<string, TomlAdapterConfig>;
}

// ---------------------------------------------------------------------------
// Plugin manifest (used by registry for discovery)
// ---------------------------------------------------------------------------

export interface PluginManifest {
  name: string;
  module: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  credentials: Record<string, string>;
  filters: FilterDefinition[];
}
