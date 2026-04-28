import { getSettingValue } from '../../core/settings/service.js';
/**
 * Plexus lifecycle manager (PRD-090, US-02).
 *
 * Manages the full adapter lifecycle: register → initialize → health-check
 * loop → shutdown. Error isolation ensures one misbehaving adapter never
 * affects others.
 */
import {
  deleteAdapter,
  getAdapterRow,
  getEnabledFilterRows,
  incrementIngestedCount,
  syncFilterRows,
  updateAdapterLastHealth,
  updateAdapterStatus,
  upsertAdapterRow,
} from './lifecycle-db.js';

import type { PlexusAdapterInterface } from './adapter.js';
import type {
  AdapterConfig,
  AdapterStatusValue,
  FilterDefinition,
  PlexusAdapterRow,
} from './types.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

function getPlexusHealthIntervalMs(): number {
  return getSettingValue('cerebrum.plexus.healthIntervalMs', 5 * 60 * 1000);
}

function getPlexusHealthTimeoutMs(): number {
  return getSettingValue('cerebrum.plexus.healthTimeoutMs', 10_000);
}

function getPlexusMaxConsecutiveFailures(): number {
  return getSettingValue('cerebrum.plexus.maxConsecutiveFailures', 3);
}

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

  constructor(options?: { healthIntervalMs?: number }) {
    this.healthIntervalMs = options?.healthIntervalMs ?? getPlexusHealthIntervalMs();
  }

  /** Register an adapter and immediately attempt initialisation. */
  async register(
    adapter: PlexusAdapterInterface,
    config: AdapterConfig,
    filters?: FilterDefinition[]
  ): Promise<PlexusAdapterRow> {
    const id = `plx_${adapter.name}`;
    upsertAdapterRow(id, adapter.name, config.settings, new Date().toISOString());
    if (filters) syncFilterRows(id, filters);

    updateAdapterStatus(id, 'initializing');
    try {
      await withTimeout(
        adapter.initialize(config),
        getPlexusHealthTimeoutMs(),
        `initialize(${adapter.name})`
      );
      updateAdapterStatus(id, 'healthy');
      updateAdapterLastHealth(id);
    } catch (err) {
      updateAdapterStatus(id, 'error', errMsg(err));
      return getAdapterRow(id);
    }

    const entry: RegisteredAdapter = {
      instance: adapter,
      consecutiveFailures: 0,
      healthTimer: null,
    };
    this.adapters.set(id, entry);
    this.scheduleHealthCheck(id, entry);
    return getAdapterRow(id);
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
    return deleteAdapter(adapterId);
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

  /** Whether an adapter is healthy and available for work dispatch. */
  isHealthy(adapterId: string): boolean {
    if (!this.adapters.has(adapterId)) return false;
    return getAdapterRow(adapterId).status === 'healthy';
  }

  /** Trigger an immediate ingestion cycle. */
  async sync(adapterId: string): Promise<{ ingested: number; filtered: number }> {
    const entry = this.adapters.get(adapterId);
    if (!entry) throw new Error(`Adapter '${adapterId}' is not active`);
    const row = getAdapterRow(adapterId);
    if (row.status === 'error')
      throw new Error(`Adapter '${adapterId}' is in error state — re-initialize first`);

    const { applyFilters } = await import('./filters.js');
    let items: import('./types.js').EngineData[];
    try {
      items = await entry.instance.ingest({});
    } catch (err) {
      updateAdapterStatus(adapterId, 'error', errMsg(err));
      throw err;
    }

    for (const item of items) item.source = `plexus:${row.name}`;
    const { accepted, filtered } = applyFilters(items, getEnabledFilterRows(adapterId));
    incrementIngestedCount(adapterId, accepted.length);
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
      updateAdapterStatus(id, 'shutdown');
    });
    await Promise.allSettled(shutdowns);
    this.adapters.clear();
  }

  getActiveAdapterIds(): string[] {
    return [...this.adapters.keys()];
  }
  getAdapterInstance(id: string): PlexusAdapterInterface | undefined {
    return this.adapters.get(id)?.instance;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

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
        getPlexusHealthTimeoutMs(),
        `healthCheck(${adapterId})`
      );
      if (result.status === 'healthy') {
        entry.consecutiveFailures = 0;
        updateAdapterStatus(adapterId, 'healthy');
        updateAdapterLastHealth(adapterId);
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
    if (entry.consecutiveFailures >= getPlexusMaxConsecutiveFailures()) {
      updateAdapterStatus(adapterId, 'error', message);
      if (entry.healthTimer) clearTimeout(entry.healthTimer);
      this.adapters.delete(adapterId);
      return { status: 'error', lastCheck: now, error: message };
    }
    updateAdapterStatus(adapterId, 'degraded', message);
    return { status: 'degraded', lastCheck: now, error: message };
  }
}
