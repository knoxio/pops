/**
 * Plexus type definitions (plugin-architecture PRD).
 *
 * Row + API shapes for adapters and filters live in the pillar DB barrel
 * (`PlexusAdapter`, `PlexusFilter`, … in src/db); this file owns the in-process
 * orchestration types (engine data, adapter config, filter rules) the lifecycle
 * manager consumes.
 */

export const ADAPTER_STATUSES = [
  'registered',
  'initializing',
  'healthy',
  'degraded',
  'error',
  'shutdown',
] as const;
export type AdapterStatusValue = (typeof ADAPTER_STATUSES)[number];

/**
 * Content produced by an adapter's `ingest()` method. Passed directly into the
 * ingestion pipeline (ingestion-pipeline PRD). The adapter provides what it
 * knows; the pipeline fills in classification, entity extraction, and scope
 * inference.
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

export interface AdapterStatus {
  status: 'healthy' | 'degraded' | 'error';
  /** Human-readable detail. */
  message?: string;
  /** ISO 8601 timestamp of the check. */
  lastChecked: string;
  /** Adapter-specific metrics (connection pool size, rate-limit remaining, etc.). */
  metrics?: Record<string, unknown>;
}

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
