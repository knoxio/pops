import {
  createSnapshotResolverLeg,
  fetchRegistrySnapshot,
  type RegistryFetchResult,
} from './fetcher.js';

import type { RegistrySnapshot } from './types.js';

export const DEFAULT_REGISTRY_URL = 'http://core-api:3001';
export const DEFAULT_CACHE_TTL_MS = 30_000;
export const MIN_CACHE_TTL_MS = 5_000;
export const REFRESH_LEAD_MS = 1_000;

/**
 * Adapter the cache uses to talk to the registry. Production wires the
 * real {@link fetchRegistrySnapshot}; tests inject a fake to avoid IO.
 */
export type RegistryFetcher = (registryUrl: string) => Promise<RegistryFetchResult>;

export type WarnFn = (message: string, context: Record<string, unknown>) => void;

/**
 * Opaque handle for the cache's background timer. The real impl uses
 * `setTimeout`/`clearTimeout`; tests inject a fake clock that returns
 * anything matching this shape.
 */
export type TimerHandle = unknown;

export type SetTimerFn = (cb: () => void, ms: number) => TimerHandle;
export type ClearTimerFn = (handle: TimerHandle) => void;

export type CacheConfig = {
  registryUrl?: string;
  ttlMs?: number;
  fetcher?: RegistryFetcher;
  now?: () => number;
  setTimeoutImpl?: SetTimerFn;
  clearTimeoutImpl?: ClearTimerFn;
  onWarn?: WarnFn;
};

export type ResolvedConfig = {
  registryUrl: string;
  ttlMs: number;
  fetcher: RegistryFetcher;
  now: () => number;
  setTimeoutImpl: SetTimerFn;
  clearTimeoutImpl: ClearTimerFn;
  onWarn: WarnFn;
};

export type CachedSnapshot = {
  pillars: RegistrySnapshot['pillars'];
  fetchedAt: Date;
  isStale: boolean;
};

export type CacheState = {
  config: ResolvedConfig;
  snapshot: CachedSnapshot | null;
  inFlight: Promise<CachedSnapshot> | null;
  backgroundTimer: TimerHandle | null;
  consecutiveFailures: number;
  queuedFailures: { count: number; error: Error } | null;
  seeded: boolean;
};

/**
 * Build a fetcher backed by ONE long-lived slash-first path resolver so the
 * cache's repeated polls cache the winning registry-snapshot path between calls
 * and self-heal on a later 404. Each cache instance gets its own resolver.
 */
export function createDefaultFetcher(): RegistryFetcher {
  const leg = createSnapshotResolverLeg();
  return (registryUrl: string): Promise<RegistryFetchResult> =>
    fetchRegistrySnapshot({ registryUrl, leg });
}

export class NodeTimerHandle {
  constructor(readonly handle: ReturnType<typeof setTimeout>) {}
}

export function defaultSetTimer(cb: () => void, ms: number): TimerHandle {
  return new NodeTimerHandle(setTimeout(cb, ms));
}

export function defaultClearTimer(handle: TimerHandle): void {
  if (handle instanceof NodeTimerHandle) clearTimeout(handle.handle);
}

export function defaultWarn(message: string, context: Record<string, unknown>): void {
  globalThis.console.warn(`[pillar-sdk:discovery] ${message}`, context);
}

export function clampTtl(ttlMs: number, onWarn: WarnFn): number {
  if (ttlMs < MIN_CACHE_TTL_MS) {
    onWarn('ttlMs below minimum; clamped', { requested: ttlMs, applied: MIN_CACHE_TTL_MS });
    return MIN_CACHE_TTL_MS;
  }
  return ttlMs;
}

export function unrefTimer(timer: TimerHandle): void {
  if (timer instanceof NodeTimerHandle) timer.handle.unref?.();
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function toRegistrySnapshot(
  cached: CachedSnapshot,
  source: RegistrySnapshot['source'],
  ttlMs: number
): RegistrySnapshot {
  return {
    pillars: cached.pillars,
    fetchedAt: cached.fetchedAt,
    ttlMs,
    source,
  };
}

export function createInitialState(overrides: CacheConfig): CacheState {
  const onWarn: WarnFn = overrides.onWarn ?? defaultWarn;
  return {
    config: {
      registryUrl: overrides.registryUrl ?? DEFAULT_REGISTRY_URL,
      ttlMs: clampTtl(overrides.ttlMs ?? DEFAULT_CACHE_TTL_MS, onWarn),
      fetcher: overrides.fetcher ?? createDefaultFetcher(),
      now: overrides.now ?? Date.now,
      setTimeoutImpl: overrides.setTimeoutImpl ?? defaultSetTimer,
      clearTimeoutImpl: overrides.clearTimeoutImpl ?? defaultClearTimer,
      onWarn,
    },
    snapshot: null,
    inFlight: null,
    backgroundTimer: null,
    consecutiveFailures: 0,
    queuedFailures: null,
    seeded: false,
  };
}
