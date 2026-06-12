import {
  configureCache,
  queueFailures,
  seedSnapshot,
  type CacheConfig,
} from '../discovery/cache.js';

import type { RegistrySnapshot } from '../discovery/types.js';

/**
 * Seeds the discovery cache with a hand-crafted snapshot. The
 * background refresh timer is suspended; the cache returns the injected
 * snapshot for every lookup until {@link invalidateRegistryCache} is
 * called or {@link disposeDiscoveryClient} is invoked.
 */
export function seedRegistryCache(snapshot: RegistrySnapshot): void {
  seedSnapshot(snapshot);
}

/**
 * Makes the next `count` registry fetches throw `error`. Useful for
 * exercising the stale-fallback + `RegistryUnreachableError` paths.
 * Subsequent fetches (after the count is exhausted) fall through to
 * the configured fetcher.
 */
export function failNextRegistryFetches(count: number, error: Error): void {
  queueFailures(count, error);
}

/**
 * Replaces the cache configuration wholesale. Test-only; production
 * code should use the individual `set*` setters from the discovery
 * subpath.
 */
export function configureDiscoveryForTest(overrides: CacheConfig): void {
  configureCache(overrides);
}
