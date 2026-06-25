# Discovery client

> Theme: [Federation](../README.md)

## Overview

The server-side read counterpart to pillar bootstrap: any process that needs to discover what pillars are running and what they advertise calls `lookupPillar('finance')` or `pillarRegistry()`. Both are backed by a single in-process, TTL-cached snapshot of the registry pillar's discovery view, with background refresh, last-known-cache fallback on registry outages, and dedup of concurrent in-flight fetches.

The API is async-only: the first call awaits a network fetch; subsequent calls return from cache until the TTL expires. The discovery client is consumed by sibling pillars, the orchestrator, the shell, and any future cross-pillar reader.

This is the **read side** of the runtime registry. The **write side** — manifests being POSTed on boot, heartbeats, deregistration — lives in the bootstrap helper and the registry pillar's endpoints. This PRD owns the client; the registry's snapshot/subscribe HTTP surface is described here only as the contract the client reads.

Shipped as the `@pops/pillar-sdk` subpaths `./discovery` (runtime) and `./testing/discovery` (test harness). Source: `libs/sdk/src/discovery/`, `libs/sdk/src/testing/discovery.ts`. The registry serves the snapshot from `pillars/registry`.

## Data model

### Snapshot types (`@pops/pillar-sdk/discovery`)

```ts
type PillarStatus = 'healthy' | 'unavailable' | 'unknown';

type PillarSnapshot = {
  pillarId: string;
  baseUrl: string; // resolved at registration time, e.g. 'http://finance-api:3004'
  manifest: ManifestPayload;
  registered: boolean; // false during reconciliation windows
  lastSeenAt: Date; // last successful heartbeat at the registry (normalised from ISO)
  status?: PillarStatus; // registry-computed liveness; optional for legacy/test snapshots
  capabilities?: CapabilityStatuses; // self-reported <capabilityKey> → up/down
};

type RegistrySnapshot = {
  pillars: PillarSnapshot[];
  fetchedAt: Date; // when THIS client fetched it
  ttlMs: number; // configured TTL window
  source: 'fresh' | 'cached' | 'stale-fallback';
};

class RegistryUnreachableError extends Error {
  readonly name: 'RegistryUnreachableError';
  readonly attempts: number;
  readonly cause?: unknown;
}
```

`status` is the registry's live liveness verdict (computed from `lastHeartbeatAt` on every snapshot read, so it reflects the freshest state even if a background ticker lags):

| `status`      | Meaning                                                      | Conservative consumer treats as |
| ------------- | ------------------------------------------------------------ | ------------------------------- |
| `healthy`     | Registry got a successful healthcheck within its window      | up                              |
| `unavailable` | Registry observed a failed healthcheck and has not recovered | down                            |
| `unknown`     | Registry has not yet probed this pillar (cold-start window)  | down                            |

`capabilities` is the flat `Record<string, boolean>` the pillar self-reports on register/heartbeat. Consumers gate features and federated-settings reads on these. Absent when the pillar advertises none.

### Cache state machine

```
[UNINITIALISED]
  ├─ lookup → fetch → [FRESH]
  └─ fetch fails, cache empty → throw RegistryUnreachableError

[FRESH] (cached, age < TTL)
  ├─ lookup → return cache (source: 'cached')
  └─ TTL expiry → background refresh → [FRESH] or [STALE_FALLBACK]

[STALE_FALLBACK] (cached, but most recent refresh failed)
  ├─ lookup → return cache (source: 'stale-fallback') + console.warn
  ├─ next refresh → success → [FRESH]
  └─ next refresh → fail → stay [STALE_FALLBACK], increment consecutiveFailures
```

There is **one cache per process** (a module-level singleton). Sharing the cache across the whole process is the point — no per-call instances.

## REST surface (the contract the client reads)

The registry pillar dual-mounts every discovery/handshake operation on the canonical slash path and the legacy dotted alias, both pointing at the same handler. The client prefers the slash path and falls back to the dotted alias on a `404` during the rolling-deploy window. A `5xx` surfaces immediately without falling back. The wire is **raw HTTP/SSE, not ts-rest / not tRPC** — the snapshot body is the bare `{ pillars, fetchedAt }` object.

| Operation       | Canonical             | Legacy alias          | Method | Body                            |
| --------------- | --------------------- | --------------------- | ------ | ------------------------------- |
| Snapshot (read) | `/registry/pillars`   | `/core.registry.list` | GET    | `{ pillars: [...], fetchedAt }` |
| Subscribe (SSE) | `/registry/subscribe` | —                     | GET    | SSE event stream                |

The fetcher tolerates a `{ result: { data } }` envelope so a mixed deployment reads either shape. Default registry base URL is `http://registry-api:3001`, overridable via `setRegistryUrl()` or the cache config.

Each snapshot entry on the wire carries `lastSeenAt` **or** `lastHeartbeatAt` (the client normalises either to `lastSeenAt: Date`), plus the manifest, `status`, `registered`, and optional `capabilities`. An entry omitting `registered` defaults to `true` unless `status === 'unknown'`, in which case it resolves to `false`.

## API surface

### Runtime (`@pops/pillar-sdk/discovery`)

```ts
// Manifest snapshot of one pillar, or undefined if not registered.
// First call may await a fetch; later calls within the TTL are cache hits.
// Throws RegistryUnreachableError ONLY when the cache is empty AND the
// registry is unreachable. Any cached data (even stale) is returned in
// preference to throwing.
function lookupPillar(pillarId: string): Promise<PillarSnapshot | undefined>;

// Full registry snapshot. Same caching + fallback semantics.
function pillarRegistry(): Promise<RegistrySnapshot>;

// Point the cache at a different registry base URL (tests / non-default
// deployments). Invalidates the cache; next lookup hits the new URL.
function setRegistryUrl(url: string): void;

// Set the TTL in ms (default 30_000). Clamped to a 5_000 minimum with a
// warning. Invalidates the cache so the next lookup refetches.
function setCacheTtlMs(ttlMs: number): void;

// Force-invalidate: drop the cached snapshot + cancel the background timer.
// Next lookup fetches fresh.
function invalidateRegistryCache(): void;

// Tear down: cancel the background timer and reset all cache state. For
// process shutdown / test cleanup.
function disposeDiscoveryClient(): void;
```

Constants exported alongside: `DEFAULT_REGISTRY_URL` (`http://registry-api:3001`), `DEFAULT_CACHE_TTL_MS` (`30_000`), `MIN_CACHE_TTL_MS` (`5_000`).

### SSE reconnect helper (`@pops/pillar-sdk/discovery`)

A minimal self-healing subscription scheduler for `GET /registry/subscribe`. The caller supplies `connect` (open the SSE stream) and `fetchSnapshot` (refresh local cache); the helper owns the reconnect schedule. On stream close it refetches the snapshot once (so the consumer is correct even if events were missed), then reconnects with exponential backoff capped at 30s. `stop()` halts the loop and closes the active handle.

```ts
function startReconnectingSubscription(
  opts: ReconnectingSubscriptionOptions
): ReconnectingSubscription;
function computeBackoffDelay(attempt: number, opts?): number; // 1-based, capped
// RECONNECT_INITIAL_DELAY_MS = 500, RECONNECT_MAX_DELAY_MS = 30_000, RECONNECT_BACKOFF_FACTOR = 2
```

### Test harness (`@pops/pillar-sdk/testing/discovery`)

```ts
// Seed the cache with a hand-crafted snapshot. Suspends the background
// timer; the cache returns the injected snapshot for every lookup until
// invalidate/dispose is called.
function seedRegistryCache(snapshot: RegistrySnapshot): void;

// Make the next N registry fetches throw the given error. Exercises the
// stale-fallback + RegistryUnreachableError paths. Fetches past N fall
// through to the real fetcher.
function failNextRegistryFetches(count: number, error: Error): void;

// Replace the whole cache config (injected fetcher, clock, timers, warn fn).
function configureDiscoveryForTest(overrides: CacheConfig): void;
```

## Business rules

- **One cache per process.** Module-level singleton; no per-call instances.
- **TTL default 30s, 5s floor.** `setCacheTtlMs` clamps anything below `MIN_CACHE_TTL_MS` to 5s and warns. Below 5s the polling load on the registry is unreasonable.
- **First lookup ever blocks until the registry responds or the request fails.** No optimistic empty cache. The failure surfaces at the first consumer; later consumers see whatever cached state then exists.
- **Background refresh starts after the first successful fetch.** A timer is armed at `ttlMs - 1s` (refresh 1s before expiry to avoid serving anything past its TTL). It runs even with no recent consumer, keeping the cache warm. The timer is `unref()`'d so it never keeps the process alive on its own.
- **Concurrent lookups during a fetch share the in-flight Promise.** No thundering herd: the cache stores `inFlight`; if set, callers await it; if not, one fetch is kicked off and stored. Cleared when it settles.
- **Refresh failures don't replace the cache.** A failed refresh promotes the existing snapshot to `[STALE_FALLBACK]` (consumers keep receiving last-known data), increments `consecutiveFailures`, and emits one `console.warn` per failure with the count + error.
- **Stale-fallback responses are labelled `source: 'stale-fallback'`.** Consumers that gate writes can detect this and degrade explicitly (e.g. refuse a write to a pillar last verified minutes ago).
- **`lookupPillar` returns `undefined`, never throws, for an unregistered pillar.** Looking up a pillar that hasn't booted is not an error. Errors are reserved for "registry unreachable AND cache empty".
- **All fetches use a 5s timeout** via `AbortController`. A hung fetch doesn't block the cache; a timeout counts as a failure.
- **The client never authenticates.** The registry snapshot is open within the LAN/docker network. No tokens, no API keys.
- **Slash-first with legacy fallback.** The fetcher resolves `/registry/pillars` first, falling back to `/core.registry.list` on a 404, and caches the winning path between polls (self-healing: re-expands to both candidates on a later 404 against the cached path; a 5xx surfaces immediately).
- **Malformed / schema-invalid registry responses are treated as fetch failures** (Zod-validated via `ManifestPayloadSchema`); the cache holds the previous good state and the failure is logged.
- **`disposeDiscoveryClient()` cancels the background timer** and resets all state. Required by test cleanup; the explicit bootstrap shutdown wiring is not yet done (see [idea](../../../ideas/discovery-client.md)).
- **Test harness suspends the background timer** when `seedRegistryCache` is called — tests don't want refresh races.

## Edge cases

| Case                                                             | Behaviour                                                                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| First lookup, registry unreachable                               | Throws `RegistryUnreachableError`. Consumer's job to handle.                                                                              |
| First lookup succeeds, second lookup within TTL                  | Returns cache (`source: 'cached'`); no network.                                                                                           |
| Cache fresh; pillar in cache but actually crashed                | Client doesn't know until the next refresh + the registry marks it `unavailable`/`unknown`. At most one TTL of stale state. Acceptable.   |
| Cache fresh; pillar registered with stale `baseUrl`              | Consumer sees stale `baseUrl` until next refresh. Real-world frequency ~never (compose IPs are stable for container lifetime).            |
| Two consumers call `lookupPillar` concurrently while cache empty | Both await the same in-flight Promise. One HTTP request.                                                                                  |
| Cache fresh; lookup target not in the cache                      | Returns `undefined`. Consumer fallback handles.                                                                                           |
| Background refresh fails many times in a row                     | Cache stays `[STALE_FALLBACK]`; warnings continue; `consecutiveFailures` climbs. No crash, no escalation. External monitoring catches it. |
| `setRegistryUrl()` called mid-operation                          | Cache invalidated; next lookup hits the new URL.                                                                                          |
| `setCacheTtlMs()` called with a value < 5_000                    | Clamped to 5_000; emits a warning.                                                                                                        |
| TTL elapses while a long-running consumer is `await`ing a lookup | The await resolves with the post-refresh snapshot. No partial state.                                                                      |
| Registry returns malformed JSON                                  | Treated as a fetch failure (same fallback semantics); body preview logged.                                                                |
| Registry returns a payload that fails schema validation          | Treated as a fetch failure; cache holds the previous good state.                                                                          |
| Snapshot path 404s (slash not yet mounted)                       | Fetcher falls back to the legacy dotted path; winning path cached for subsequent polls.                                                   |
| Registry up but snapshot route 5xx                               | Surfaces immediately without falling back to the legacy path.                                                                             |
| Test calls `lookupPillar` without seeding                        | A real network fetch happens. Tests must `seedRegistryCache` / `configureDiscoveryForTest` or they hit the network.                       |
| `invalidateRegistryCache()` called during a fetch                | Cache marked invalid; the in-flight fetch settles; on success it repopulates, on failure the next lookup starts fresh.                    |
| SSE stream closes (registry restart / network drop)              | Reconnect helper refetches the snapshot once, then reconnects with capped exponential backoff (500ms → 30s).                              |

## Acceptance criteria

- [x] `PillarSnapshot`, `RegistrySnapshot`, `PillarStatus`, `RegistryUnreachableError` are defined and exported from `@pops/pillar-sdk/discovery`.
- [x] Snapshot fetcher reads `GET /registry/pillars` slash-first, falls back to `/core.registry.list` on 404, surfaces 5xx without fallback, applies a 5s timeout, and Zod-validates the response (manifest schema; malformed/invalid → fetch failure).
- [x] Fetcher normalises `lastSeenAt`/`lastHeartbeatAt` to a `Date`, resolves `registered` (defaulting to `true`, or `false` when `status === 'unknown'`), and threads through `status` + `capabilities` when present.
- [x] In-memory cache: TTL math, in-flight dedup, fresh/cached/stale-fallback source labelling, `consecutiveFailures` counter, background timer armed at `ttlMs - 1s` and `unref()`'d.
- [x] `lookupPillar()` returns the matching `PillarSnapshot` or `undefined`; `pillarRegistry()` returns the full snapshot — both async, both share the cache.
- [x] Background refresh transitions `[FRESH] → [STALE_FALLBACK]` on failure, keeps serving last-known data, and emits a `console.warn` per failure with the count.
- [x] First lookup with empty cache + unreachable registry throws `RegistryUnreachableError`; any cached data is preferred over throwing.
- [x] `setRegistryUrl`, `setCacheTtlMs` (5s floor + warn), `invalidateRegistryCache`, `disposeDiscoveryClient` behave per the rules above.
- [x] Test harness `seedRegistryCache`, `failNextRegistryFetches`, `configureDiscoveryForTest` exported from `@pops/pillar-sdk/testing/discovery`; seeding suspends the background timer.
- [x] SSE reconnect helper (`startReconnectingSubscription`, `computeBackoffDelay`) refetches once on close and reconnects with capped exponential backoff.
- [ ] `disposeDiscoveryClient()` is wired into the bootstrap helper's shutdown path so the background timer is torn down on `stop()`/SIGTERM. _(Not built — the cache timer is `unref()`'d so it never blocks shutdown, but `bootstrapPillar().stop()` only clears its heartbeat interval and unregisters; it does not call `disposeDiscoveryClient()`. See [idea](../../../ideas/discovery-client.md).)_

## Out of scope

- Subscribing to per-pillar events ("notify me when finance drops off"). The SSE reconnect helper refetches the whole snapshot on reconnect; specific-pillar reactions are the consumer's job.
- Multi-registry / fallback registries. Single registry URL; no failover.
- Authentication or signed payloads. The registry is trusted-within-the-network.
- Caching contract _types_ in addition to the manifest. Types are imported at consumer build time; the runtime cache holds only the dynamic manifest.
- Cache persistence across process restarts. Volatile; a fresh process refetches.
- `lookupPillarOrThrow()` helper. Consumers can write their own one-liner.
- Bulk lookups (`lookupPillars([...])`). Call `pillarRegistry()` then filter.
- Per-pillar type narrowing (`lookupPillar<'finance'>(...)` returning a `FinancePillarSnapshot`). The strongly-typed cross-pillar SDK surface handles that.
- Metrics / observability beyond the warning logs. Hook a callback if needed; standardising emission is out of scope.
