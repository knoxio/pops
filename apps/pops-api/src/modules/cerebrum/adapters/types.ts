/**
 * Shared types for the Plexus adapter system (PRD-090 / PRD-091).
 *
 * Defines the PlexusAdapter interface, BaseAdapter abstract class, and
 * supporting types (EngineData, AdapterConfig, AdapterStatus, etc.)
 * that all adapters implement.
 */

// ---------------------------------------------------------------------------
// Adapter status
// ---------------------------------------------------------------------------

export type AdapterHealthStatus = 'healthy' | 'degraded' | 'error';

export interface AdapterStatus {
  status: AdapterHealthStatus;
  /** Human-readable status detail. */
  message?: string;
  /** ISO 8601 timestamp of the last health check. */
  lastChecked: string;
  /** Adapter-specific metrics (e.g. rate-limit remaining, connection pool). */
  metrics?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter configuration
// ---------------------------------------------------------------------------

export interface AdapterConfig<TSettings = Record<string, unknown>> {
  /** Adapter name, e.g. 'email', 'calendar', 'github'. */
  name: string;
  /** Credentials resolved from environment variables. */
  credentials: Record<string, string>;
  /** Adapter-specific settings. */
  settings: TSettings;
}

// ---------------------------------------------------------------------------
// Ingestion options
// ---------------------------------------------------------------------------

export interface IngestFilter {
  /** The field this filter applies to (adapter-specific). */
  field: string;
  /** Regex pattern to match against. */
  pattern: string;
  /** Filter type: include whitelists, exclude blacklists. */
  type: 'include' | 'exclude';
}

export interface IngestOptions {
  /** Only fetch items newer than this timestamp. */
  since?: Date;
  /** Maximum items to return. */
  limit?: number;
  /** Filter rules resolved by the plugin system. */
  filters?: IngestFilter[];
}

// ---------------------------------------------------------------------------
// Emit options & content
// ---------------------------------------------------------------------------

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
  /** Additional metadata (e.g. `to` addresses for email). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EngineData — pre-engram structure returned by ingest()
// ---------------------------------------------------------------------------

export interface EngineData {
  /** Content body (Markdown). Required. */
  body: string;
  /** Title for the engram. */
  title?: string;
  /** Content type hint. */
  type?: string;
  /** Scope assignments. */
  scopes?: string[];
  /** Tags for categorisation. */
  tags?: string[];
  /** Source identifier — must be `plexus:{adapter_name}`. */
  source: `plexus:${string}`;
  /** Adapter-specific custom fields indexed by Thalamus. */
  customFields?: Record<string, unknown>;
  /** External system ID for deduplication (e.g. Message-ID, event UID). */
  externalId?: string;
}

// ---------------------------------------------------------------------------
// PlexusAdapter interface
// ---------------------------------------------------------------------------

export interface PlexusAdapter<TSettings = Record<string, unknown>> {
  /** Adapter name. */
  readonly name: string;

  /** Initialise the adapter with configuration. */
  initialize(config: AdapterConfig<TSettings>): Promise<void>;

  /** Fetch data from the external source and return pre-engram items. */
  ingest(options: IngestOptions): Promise<EngineData[]>;

  /** Check the adapter's connection health. */
  healthCheck(): Promise<AdapterStatus>;

  /** Graceful shutdown. */
  shutdown(): Promise<void>;

  /** Optional: emit content to the external system. */
  emit?(options: EmitOptions, content: EmitContent): Promise<void>;
}

// ---------------------------------------------------------------------------
// BaseAdapter — abstract class with sensible defaults
// ---------------------------------------------------------------------------

export abstract class BaseAdapter<
  TSettings = Record<string, unknown>,
> implements PlexusAdapter<TSettings> {
  abstract readonly name: string;

  protected config: AdapterConfig<TSettings> | null = null;
  protected status: AdapterHealthStatus = 'healthy';

  /** Store config. Subclasses should call super.initialize() then do their own setup. */
  async initialize(config: AdapterConfig<TSettings>): Promise<void> {
    this.config = config;
  }

  abstract ingest(options: IngestOptions): Promise<EngineData[]>;

  /** Default: return healthy. Subclasses override for real checks. */
  async healthCheck(): Promise<AdapterStatus> {
    return {
      status: this.status,
      lastChecked: new Date().toISOString(),
    };
  }

  /** Default no-op. Subclasses override if cleanup is needed. */
  async shutdown(): Promise<void> {
    this.config = null;
  }

  /** Resolve a credential from the config, throwing if missing. */
  protected requireCredential(key: string): string {
    if (!this.config) {
      throw new Error(`${this.name} adapter not initialised — call initialize() first`);
    }
    const value = this.config.credentials[key];
    if (!value) {
      throw new Error(`${this.name} adapter: required credential "${key}" not found in config`);
    }
    return value;
  }

  /** Require the adapter to be initialised, returning the config. */
  protected requireConfig(): AdapterConfig<TSettings> {
    if (!this.config) {
      throw new Error(`${this.name} adapter not initialised — call initialize() first`);
    }
    return this.config;
  }
}
