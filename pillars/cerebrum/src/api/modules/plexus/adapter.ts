/**
 * Plexus adapter interface and base class (PRD-090, US-01).
 *
 * Lifted from the pops-api monolith during the cerebrum REST migration.
 * Every adapter implements `PlexusAdapterInterface`. `BaseAdapter` provides
 * sensible defaults so simple adapters only need to override `ingest()`.
 */
import type {
  AdapterConfig,
  AdapterStatus,
  EmitContent,
  EmitOptions,
  EngineData,
  IngestOptions,
} from './types.js';

/**
 * Contract that every Plexus adapter must fulfil.
 *
 * Four required methods (`initialize`, `ingest`, `healthCheck`, `shutdown`)
 * and one optional (`emit`). Adapters that do not support output leave `emit`
 * undefined — calling it throws a descriptive error via the lifecycle manager.
 */
export interface PlexusAdapterInterface<TSettings = Record<string, unknown>> {
  /** Human-readable adapter name (e.g. `email`, `github`). */
  readonly name: string;
  /** Semantic version of the adapter implementation. */
  readonly version: string;

  /**
   * Initialise the adapter with resolved configuration. Called once after
   * registration. Should validate credentials and establish connections.
   * Throw on failure — the lifecycle manager catches it and transitions the
   * adapter to `error`.
   */
  initialize(config: AdapterConfig<TSettings>): Promise<void>;

  /**
   * Fetch content from the external system. Returns an array of `EngineData`
   * items that the ingestion pipeline will process.
   */
  ingest(options: IngestOptions): Promise<EngineData[]>;

  /** Check adapter health: connection alive, credentials valid, rate limits OK. */
  healthCheck(): Promise<AdapterStatus>;

  /** Gracefully shut down the adapter: close connections, flush buffers. */
  shutdown(): Promise<void>;

  /**
   * Emit content to the external system. Optional — only adapters that support
   * output (e.g. email) implement this.
   */
  emit?(options: EmitOptions, content: EmitContent): Promise<void>;
}

/**
 * Abstract base class reducing boilerplate for simple adapters.
 *
 * Provides default implementations:
 * - `initialize`: stores the config for subclass use
 * - `healthCheck`: returns `healthy`
 * - `shutdown`: no-op
 *
 * Concrete adapters extend this and override `ingest()` at minimum.
 */
export abstract class BaseAdapter<
  TSettings = Record<string, unknown>,
> implements PlexusAdapterInterface<TSettings> {
  abstract readonly name: string;
  abstract readonly version: string;

  protected config: AdapterConfig<TSettings> | null = null;

  async initialize(config: AdapterConfig<TSettings>): Promise<void> {
    this.config = config;
  }

  abstract ingest(options: IngestOptions): Promise<EngineData[]>;

  async healthCheck(): Promise<AdapterStatus> {
    return {
      status: 'healthy',
      lastChecked: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    // No-op by default.
  }
}

/**
 * Call `emit` on an adapter, throwing a descriptive error if the adapter does
 * not implement it.
 */
export function callEmit(
  adapter: PlexusAdapterInterface,
  options: EmitOptions,
  content: EmitContent
): Promise<void> {
  if (!adapter.emit) {
    return Promise.reject(new Error(`Adapter '${adapter.name}' does not support emit operations`));
  }
  return adapter.emit(options, content);
}
