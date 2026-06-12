# PRD-159: Discovery client

> Epic: [Pillar SDK](../../epics/01-pillar-sdk.md)

## Overview

The server-side counterpart to `bootstrapPillar()`: `lookupPillar('finance')` and `pillarRegistry()` for any process that needs to discover what pillars are running and what they advertise. Backed by a TTL-cached snapshot of `core.registry.snapshot()` with background refresh, last-known-cache fallback on registry outages, and dedup of concurrent in-flight fetches. Async-only API — first call awaits a fetch; subsequent calls return from cache until the TTL expires. Used by sibling pillars, pops-api, pops-worker, and any future cross-pillar consumer.

This is the read side of the runtime registry. The write side (manifests being POSTed) lives in PRD-158 (bootstrap) + PRD-161 (registry endpoints).

## Data Model

### Snapshot types

```ts
// @pops/pillar-sdk/discovery

import type { ManifestPayload } from './manifest-schema';

export type PillarSnapshot = {
  pillarId: string;
  baseUrl: string; // resolved at registration time; e.g. 'http://finance-api:3004'
  manifest: ManifestPayload;
  registered: boolean; // false during reconciliation windows
  lastSeenAt: Date; // last successful heartbeat at the registry
};

export type RegistrySnapshot = {
  pillars: PillarSnapshot[];
  fetchedAt: Date; // when THIS client fetched it
  ttlMs: number; // when it expires
  source: 'fresh' | 'cached' | 'stale-fallback';
};

export class RegistryUnreachableError extends Error {
  readonly name: 'RegistryUnreachableError';
  readonly attempts: number;
  readonly cause?: unknown;
}
```

### Cache state machine

```
[UNINITIALISED]
  ├─ lookup → fetch → [FRESH]
  └─ fetch fail → throw RegistryUnreachableError

[FRESH] (cached < TTL)
  ├─ lookup → return cache (source: 'cached')
  └─ TTL expiry → background refresh → [FRESH] or [STALE_FALLBACK]

[STALE_FALLBACK] (cached, but last refresh failed)
  ├─ lookup → return cache (source: 'stale-fallback') + log warning
  ├─ next scheduled refresh → success → [FRESH]
  └─ next scheduled refresh → fail → stay [STALE_FALLBACK]
```

### Singleton internals (not exported)

```ts
// @pops/pillar-sdk/discovery/cache.ts (internal)

type CacheState = {
  registryUrl: string;
  ttlMs: number;
  snapshot: RegistrySnapshot | null;
  inFlightFetch: Promise<RegistrySnapshot> | null; // dedup concurrent fetches
  backgroundTimer: NodeJS.Timeout | null;
  consecutiveFailures: number;
};
```

## API Surface

### Main exports

```ts
// @pops/pillar-sdk/discovery

/**
 * Returns the manifest snapshot of one pillar, or undefined if it's not
 * registered. First call may await a network fetch; subsequent calls within
 * the TTL window are served from cache.
 *
 * Throws RegistryUnreachableError only if the cache is empty AND the
 * registry can't be reached. If the cache has anything (even stale), that
 * is returned in preference to throwing.
 */
export async function lookupPillar(pillarId: string): Promise<PillarSnapshot | undefined>;

/**
 * Returns the full registry snapshot. Same caching + fallback semantics
 * as lookupPillar().
 */
export async function pillarRegistry(): Promise<RegistrySnapshot>;

/**
 * Configures the registry base URL. Default: process.env.POPS_REGISTRY_URL
 * or 'http://core-api:3001'. Settable for tests + non-default deployments.
 */
export function setRegistryUrl(url: string): void;

/**
 * Configures the TTL in milliseconds. Default 30_000. Setting forces an
 * immediate refresh on the next lookup.
 */
export function setCacheTtlMs(ttlMs: number): void;

/**
 * Force-invalidates the cache. Next lookup will fetch fresh. Useful for
 * tests + after-deploy hooks.
 */
export function invalidateRegistryCache(): void;

/**
 * Tears down the background refresh timer. Called by test cleanup and by
 * the bootstrap helper's shutdown path.
 */
export function disposeDiscoveryClient(): void;
```

### Test harness exports

```ts
// @pops/pillar-sdk/testing/discovery

/**
 * Seeds the discovery cache with a hand-crafted snapshot. The background
 * timer is suspended; the cache returns the injected snapshot for every
 * lookup until invalidateRegistryCache() is called.
 */
export function seedRegistryCache(snapshot: RegistrySnapshot): void;

/**
 * Makes the next N registry fetches fail with the given error. Useful for
 * exercising the fallback path.
 */
export function failNextRegistryFetches(count: number, error: Error): void;
```

## Business Rules

- **One cache per process.** Singleton; no per-call instances. Sharing the cache across the entire process is the whole point.
- **TTL default 30 seconds.** Configurable. Below 5 seconds the polling load on the registry becomes unreasonable; the setter clamps to a 5s minimum and warns.
- **First lookup ever blocks until the registry responds OR the request fails.** No optimistic empty cache. The failure surfaces immediately at the first consumer; later consumers see the cached state.
- **Background refresh starts after the first successful fetch.** A `setTimeout` is armed at `fetchedAt + ttlMs - 1s` (refresh 1s before expiry to avoid serving anything stale). Refresh runs even if no consumer has asked recently — the cache stays warm.
- **Concurrent lookups during a fetch share the in-flight Promise.** No thundering herd. Pattern: cache stores `inFlightFetch`; if set, return it; if not, kick off a new one and store.
- **Refresh failures don't replace the cache.** If the cached snapshot is `[FRESH]` and the refresh fails, the snapshot transitions to `[STALE_FALLBACK]` and consumers continue receiving the last-known data. `consecutiveFailures` counter increments; emits a `console.warn` per failure with the count.
- **Stale-fallback responses include `source: 'stale-fallback'`.** Consumers that care can detect this and degrade explicitly (e.g. don't make a write call to a pillar whose status we last verified 5 minutes ago).
- **`lookupPillar` returns `undefined`, not throw, when a pillar is not registered.** A consumer that calls `lookupPillar('media')` and media-api hasn't booted gets `undefined`; not an error. Errors are reserved for "the registry itself is unreachable AND the cache is empty."
- **All fetches use a 5-second timeout.** Hung fetches don't block the cache. A timeout counts as a failure.
- **The discovery client never authenticates.** The registry's `/snapshot` endpoint is open within the docker network. No tokens, no API keys.
- **`disposeDiscoveryClient()` clears the background timer.** Required at process shutdown to avoid keeping the process alive past the last connection close. The bootstrap helper's shutdown path calls it.
- **Test harness suspends the background timer when `seedRegistryCache` is called.** Tests don't want unexpected refresh races.

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First lookup, registry unreachable                                                               | Throws `RegistryUnreachableError`. Consumer's job to handle.                                                                                                                                                      |
| First lookup succeeds, second lookup happens 5s later                                            | Returns cache (source: 'cached'); no network.                                                                                                                                                                     |
| Cache is fresh; pillar appears in cache but is actually crashed                                  | Discovery client doesn't know — only the registry can mark a pillar `unavailable` (PRD-162). Until the next refresh + reconciliation, consumers see it as registered. Acceptable: at most one TTL of stale state. |
| Cache is fresh; pillar appears registered but with stale baseUrl (rare; e.g. compose IP changed) | Same: consumer sees stale baseUrl until next refresh. Real-world frequency: ~never (compose IPs are stable for the lifetime of the container).                                                                    |
| Two consumers call lookupPillar concurrently while cache is empty                                | Both await the same in-flight Promise. Only one HTTP request is made.                                                                                                                                             |
| Cache is fresh; pillar lookup target isn't in the cache                                          | Returns `undefined`. Consumer fallback handles.                                                                                                                                                                   |
| Background refresh fails 50 times in a row                                                       | Cache stays in `[STALE_FALLBACK]`. Warnings continue. No automatic crash, no escalation. Operator monitoring catches it externally.                                                                               |
| `setRegistryUrl()` called mid-operation                                                          | Cache is invalidated; next lookup hits the new URL.                                                                                                                                                               |
| `setCacheTtlMs()` called with a value < 5_000                                                    | Clamped to 5_000; emits a warning.                                                                                                                                                                                |
| Process is shutting down (SIGTERM) but a background refresh is in-flight                         | The refresh completes (or errors); `disposeDiscoveryClient` clears the timer; the Promise's result is discarded.                                                                                                  |
| Cache TTL elapses while a long-running consumer is `await`ing a lookup                           | The consumer's await resolves with the new (post-refresh) snapshot. No partial state.                                                                                                                             |
| Registry endpoint returns malformed JSON                                                         | Treated as a fetch failure; same fallback semantics. Failure logged with the raw response body for debugging.                                                                                                     |
| Registry returns a payload that fails schema validation                                          | Same: treated as failure. The fact that the registry sent an invalid response is logged; cache holds the previous good state.                                                                                     |
| Test calls `lookupPillar` without injecting a mock cache                                         | Real network fetch happens. Tests must `seedRegistryCache` or fixtures will time out.                                                                                                                             |
| `invalidateRegistryCache()` called during a fetch                                                | Cache is marked invalid; the in-flight fetch completes; if it succeeds it populates the cache; if it fails, next lookup starts fresh.                                                                             |

## User Stories

| #   | Story                                                           | Summary                                                                                                  | Parallelisable                   |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 01  | [us-01-types](us-01-types.md)                                   | `PillarSnapshot`, `RegistrySnapshot`, `RegistryUnreachableError` definitions                             | yes — independent                |
| 02  | [us-02-registry-fetcher](us-02-registry-fetcher.md)             | Tiny fetch wrapper around `GET /core.registry.snapshot` with 5s timeout + Zod validation of the response | blocked by us-01                 |
| 03  | [us-03-cache-singleton](us-03-cache-singleton.md)               | In-memory cache state + TTL math + in-flight dedup                                                       | blocked by us-02                 |
| 04  | [us-04-lookup-api](us-04-lookup-api.md)                         | `lookupPillar()` + `pillarRegistry()` against the cache                                                  | blocked by us-03                 |
| 05  | [us-05-background-refresh](us-05-background-refresh.md)         | Timer-driven background refresh with fail counter + stale-fallback transitions                           | blocked by us-03                 |
| 06  | [us-06-config-setters](us-06-config-setters.md)                 | `setRegistryUrl`, `setCacheTtlMs`, `invalidateRegistryCache`, `disposeDiscoveryClient`                   | blocked by us-03                 |
| 07  | [us-07-failure-handling](us-07-failure-handling.md)             | `RegistryUnreachableError` paths; consecutiveFailures counter; warnings on stale-fallback                | blocked by us-05                 |
| 08  | [us-08-test-harness](us-08-test-harness.md)                     | `seedRegistryCache`, `failNextRegistryFetches` for unit tests                                            | blocked by us-03                 |
| 09  | [us-09-pillar-sdk-integration](us-09-pillar-sdk-integration.md) | Wire `disposeDiscoveryClient` into `bootstrapPillar`'s shutdown path                                     | blocked by us-06 + PRD-158       |
| 10  | [us-10-author-docs](us-10-author-docs.md)                       | Documentation on the lookup contract, caching semantics, when to invalidate                              | yes — can be written in parallel |

## Out of Scope

- SSE-based push invalidation. Pure TTL polling for now; revisit if 30s staleness causes real operational pain.
- Subscribing to per-pillar events ("notify me when finance drops off"). Polling is enough; specific-pillar reactions are the consumer's job.
- Multi-registry / fallback registries. Single registry URL; no failover semantics.
- Authentication or signed payloads. The registry is trusted-within-the-docker-network.
- Caching the _contract types_ in addition to the manifest. Types are imported from `@pops/<pillar>-contract` at consumer build time; runtime cache holds only the dynamic manifest.
- Cache persistence across process restarts. The cache is volatile; a fresh process refetches.
- `lookupPillarOrThrow()` helper that throws instead of returning undefined. Consumers can write their own one-liner if they prefer.
- Bulk lookups (`lookupPillars(['finance', 'media'])`). Just call `pillarRegistry()` then filter.
- Type narrowing per pillar (e.g. `lookupPillar<'finance'>('finance')` returning `FinancePillarSnapshot`). The unified `pillar()` SDK (PRD-191) handles strongly-typed access.
- Metrics / observability beyond the warning logs. Hook via a plain callback if needed; standardising emission is out of scope.
