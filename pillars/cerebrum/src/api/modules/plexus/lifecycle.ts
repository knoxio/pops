/**
 * Plexus lifecycle manager (plugin-architecture PRD).
 *
 * Manages the full adapter lifecycle: register → initialize → health-check
 * loop → shutdown. Error isolation ensures one misbehaving adapter never
 * affects others.
 *
 * The `CerebrumDb` handle is constructor-injected (threaded through
 * `CerebrumApiDeps`); the health-loop tuning knobs (interval / timeout / max
 * failures) read from the constants below.
 */
import { plexusService, type CerebrumDb, type PlexusAdapter } from '../../../db/index.js';
import {
  deleteAdapter,
  getAdapterRow,
  getEnabledFilterRows,
  incrementIngestedCount,
  syncFilterRows,
  updateAdapterLastHealth,
  updateAdapterStatus,
} from './lifecycle-db.js';

import type { PlexusAdapterInterface } from './adapter.js';
import type { AdapterConfig, AdapterStatusValue, EngineData, FilterDefinition } from './types.js';

const DEFAULT_HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_HEALTH_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const SHUTDOWN_TIMEOUT_MS = 5_000;

interface RegisteredAdapter {
  instance: PlexusAdapterInterface;
  consecutiveFailures: number;
  healthTimer: ReturnType<typeof setTimeout> | null;
}

type HealthResult = { status: AdapterStatusValue; lastCheck: string; error?: string };

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class PlexusLifecycleManager {
  private adapters = new Map<string, RegisteredAdapter>();
  private healthIntervalMs: number;
  private healthTimeoutMs: number;
  private maxConsecutiveFailures: number;

  constructor(
    private readonly db: CerebrumDb,
    options?: {
      healthIntervalMs?: number;
      healthTimeoutMs?: number;
      maxConsecutiveFailures?: number;
    }
  ) {
    this.healthIntervalMs = options?.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
    this.healthTimeoutMs = options?.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    this.maxConsecutiveFailures =
      options?.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  }

  /** Register an adapter and immediately attempt initialisation. */
  async register(
    adapter: PlexusAdapterInterface,
    config: AdapterConfig,
    filters?: FilterDefinition[]
  ): Promise<PlexusAdapter> {
    const id = `plx_${adapter.name}`;
    const now = new Date().toISOString();
    plexusService.upsertAdapter(this.db, {
      id,
      name: adapter.name,
      config: config.settings,
      createdAt: now,
      updatedAt: now,
    });
    if (filters) syncFilterRows(this.db, id, filters);

    updateAdapterStatus(this.db, id, 'initializing');
    try {
      await withTimeout(
        adapter.initialize(config),
        this.healthTimeoutMs,
        `initialize(${adapter.name})`
      );
      updateAdapterStatus(this.db, id, 'healthy');
      updateAdapterLastHealth(this.db, id);
    } catch (err) {
      updateAdapterStatus(this.db, id, 'error', errMsg(err));
      return getAdapterRow(this.db, id);
    }

    const entry: RegisteredAdapter = {
      instance: adapter,
      consecutiveFailures: 0,
      healthTimer: null,
    };
    this.adapters.set(id, entry);
    this.scheduleHealthCheck(id, entry);
    return getAdapterRow(this.db, id);
  }

  /** Shutdown and remove an adapter. */
  async unregister(adapterId: string): Promise<boolean> {
    const entry = this.adapters.get(adapterId);
    if (entry) {
      if (entry.healthTimer) clearTimeout(entry.healthTimer);
      try {
        await withTimeout(entry.instance.shutdown(), SHUTDOWN_TIMEOUT_MS, `shutdown(${adapterId})`);
      } catch {
        /* best-effort */
      }
      this.adapters.delete(adapterId);
    }
    return deleteAdapter(this.db, adapterId);
  }

  /** Run a health check for a specific adapter. */
  async healthCheck(adapterId: string): Promise<HealthResult> {
    const entry = this.adapters.get(adapterId);
    if (!entry) {
      return {
        status: 'error',
        lastCheck: new Date().toISOString(),
        error: `Adapter '${adapterId}' is not active`,
      };
    }
    return this.runHealthCheck(adapterId, entry);
  }

  /** Trigger an immediate ingestion cycle. */
  async sync(adapterId: string): Promise<{ ingested: number; filtered: number }> {
    const entry = this.adapters.get(adapterId);
    if (!entry) throw new Error(`Adapter '${adapterId}' is not active`);
    const row = getAdapterRow(this.db, adapterId);
    if (row.status === 'error')
      throw new Error(`Adapter '${adapterId}' is in error state — re-initialize first`);

    const { applyFilters } = await import('./filters.js');
    let items: EngineData[];
    try {
      items = await entry.instance.ingest({});
    } catch (err) {
      updateAdapterStatus(this.db, adapterId, 'error', errMsg(err));
      throw err;
    }

    for (const item of items) item.source = `plexus:${row.name}`;
    const { accepted, filtered } = applyFilters(items, getEnabledFilterRows(this.db, adapterId));
    incrementIngestedCount(this.db, adapterId, accepted.length);
    return { ingested: accepted.length, filtered };
  }

  /** Gracefully shut down all active adapters. */
  async shutdownAll(): Promise<void> {
    const shutdowns = [...this.adapters.entries()].map(async ([id, entry]) => {
      if (entry.healthTimer) clearTimeout(entry.healthTimer);
      try {
        await withTimeout(entry.instance.shutdown(), SHUTDOWN_TIMEOUT_MS, `shutdown(${id})`);
      } catch {
        /* abandoned */
      }
      updateAdapterStatus(this.db, id, 'shutdown');
    });
    await Promise.allSettled(shutdowns);
    this.adapters.clear();
  }

  private scheduleHealthCheck(adapterId: string, entry: RegisteredAdapter): void {
    const jitter = Math.floor(Math.random() * 30_000);
    entry.healthTimer = setTimeout(() => {
      void this.runHealthCheck(adapterId, entry).then(() => {
        if (this.adapters.has(adapterId)) this.scheduleHealthCheck(adapterId, entry);
      });
    }, this.healthIntervalMs + jitter);
  }

  private async runHealthCheck(adapterId: string, entry: RegisteredAdapter): Promise<HealthResult> {
    const now = new Date().toISOString();
    try {
      const result = await withTimeout(
        entry.instance.healthCheck(),
        this.healthTimeoutMs,
        `healthCheck(${adapterId})`
      );
      if (result.status === 'healthy') {
        entry.consecutiveFailures = 0;
        updateAdapterStatus(this.db, adapterId, 'healthy');
        updateAdapterLastHealth(this.db, adapterId);
        return { status: 'healthy', lastCheck: now };
      }
      return this.recordFailure(adapterId, entry, result.message ?? 'Unhealthy', now);
    } catch (err) {
      return this.recordFailure(adapterId, entry, errMsg(err), now);
    }
  }

  private recordFailure(
    adapterId: string,
    entry: RegisteredAdapter,
    message: string,
    now: string
  ): HealthResult {
    entry.consecutiveFailures++;
    if (entry.consecutiveFailures >= this.maxConsecutiveFailures) {
      updateAdapterStatus(this.db, adapterId, 'error', message);
      if (entry.healthTimer) clearTimeout(entry.healthTimer);
      this.adapters.delete(adapterId);
      return { status: 'error', lastCheck: now, error: message };
    }
    updateAdapterStatus(this.db, adapterId, 'degraded', message);
    return { status: 'degraded', lastCheck: now, error: message };
  }
}
