# Heartbeat lifecycle

> Theme: [Federation](../README.md) · Area: Registry protocol
> Status: **Done** (live-status engine shipped; one transition-event gap deferred — see [idea](../../../ideas/heartbeat-ticker-event-emission.md))

The runtime status engine inside the **registry pillar** (`pillars/registry`, port `:3001`). It turns heartbeat arrivals into observable health state. Every registered pillar POSTs a heartbeat to the registry every 10s; three missed heartbeats (~30s) flip a pillar from `healthy` to `unavailable`. Detection is hybrid:

- **Lazy compute on read** — the discovery snapshot and SSE stream recompute status live from `lastHeartbeatAt` on every read, so consumers always see fresh state even if the ticker lags.
- **Background ticker** — a 10s interval inside the registry process walks `pillar_registry`, persists status transitions, and refreshes the "still alive" timestamp.

The persisted `status` column is a denormalised cache: the snapshot trusts the live computation, and the persisted value exists only to drive transition detection and feed restart reconciliation.

Persistence (the `pillar_registry` table, register/heartbeat/snapshot routes) belongs to [registry schema & endpoints](../../federation/prds/registry-schema-endpoints.md). The SSE transport that carries change events is the [subscription model](subscription-model.md). Boot reconciliation that seeds `unknown` is [reconciliation on restart](../../federation/prds/reconciliation-on-restart.md). This PRD is the status engine that sits between them.

## Data model

### Status enum

`pillar_registry.status` (TEXT, NOT NULL) is one of:

| Value         | Meaning                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `healthy`     | heartbeat received within the last `UNAVAILABLE_AFTER_MS` (interval × threshold = 30s)                                                                                                                               |
| `unavailable` | no heartbeat within the last `UNAVAILABLE_AFTER_MS`                                                                                                                                                                  |
| `unknown`     | registry restarted; the pillar missed its threshold during the outage and has not re-heartbeated yet (seeded by [reconciliation on restart](../../federation/prds/reconciliation-on-restart.md) boot reconciliation) |

`statusUpdatedAt` (TEXT ISO-8601) records when the persisted status last changed, or the last healthy-staleness refresh.

### Constants

```
HEARTBEAT_INTERVAL_MS       = 10_000   // matches the SDK heartbeat cadence
MISS_THRESHOLD              = 3
UNAVAILABLE_AFTER_MS        = 30_000   // INTERVAL × THRESHOLD
HEALTHY_STALENESS_REFRESH_MS = 60_000
```

`MISS_THRESHOLD` is fixed at 3 (ADR-027 default; not env-configurable in V1). The SDK heartbeats at `DEFAULT_HEARTBEAT_MS = 10_000`, so the registry threshold and the client cadence are the same number on purpose.

### Status computation

A pure function in `pillars/registry/src/api/modules/registry/status.ts`:

```ts
export function computeStatus(lastHeartbeatAt: Date, now: Date): 'healthy' | 'unavailable' {
  const ageMs = now.getTime() - lastHeartbeatAt.getTime();
  return ageMs < UNAVAILABLE_AFTER_MS ? 'healthy' : 'unavailable';
}
```

It only ever returns `healthy` or `unavailable`. `unknown` is never _computed_ — it is a persisted state seeded by restart reconciliation and preserved verbatim by the lazy path (`liveStatus` returns `unknown` unchanged; everything else is recomputed).

### Background ticker

`startHeartbeatTicker(db, opts?)` runs a pass every `HEARTBEAT_INTERVAL_MS` inside the registry process. Each pass (`runHeartbeatTick`):

1. Read every row in `pillar_registry`.
2. For each row, `computed = computeStatus(lastHeartbeatAt, now)`.
3. If `computed !== row.status`: queue a status update (`status = computed`, `statusUpdatedAt = now`) and a `StatusTransition`.
4. Else if `row.status === 'healthy'` and `now - statusUpdatedAt > HEALTHY_STALENESS_REFRESH_MS`: queue a no-op refresh that bumps `statusUpdatedAt = now` (keeps the "alive as of" timestamp current for restart reconciliation).
5. Apply all queued updates in **one SQLite transaction** (`applyStatusUpdates`), then fire `onTransition` per transition.

`runHeartbeatTick` is exported and returns the transitions it persisted, so tests drive it deterministically without `setInterval`. The interval handle is `unref()`'d so it never holds the process open.

### Lazy compute on snapshot

`buildRegistrySnapshot` / `toRegistryEntry` (`registry/snapshot.ts`) call `computeStatus(lastHeartbeatAt, now)` per row rather than returning the persisted `status` column (except `unknown`, which passes through). Both the discovery snapshot and the SSE initial `pillar.snapshot` frame use this path, so a delayed ticker only delays _push events_ — never the value a consumer reads.

## REST surface

This PRD adds **no new endpoints**. It layers behaviour onto the [registry schema & endpoints](../../federation/prds/registry-schema-endpoints.md) routes plus a background process:

| Surface                                                       | What this PRD contributes                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /registry/pillars` (alias `GET /core.registry.list`)     | Each entry's `status` is computed live via `computeStatus`, not read from the persisted column.                                                                                                       |
| `POST /registry/heartbeat` (alias `/core.registry.heartbeat`) | `recordHeartbeat` sets `lastHeartbeatAt = now`, `status = healthy`. On a real transition (was not `healthy`) it rewrites `statusUpdatedAt` and the handler emits a `health-changed` event to the bus. |
| `GET /registry/subscribe` (SSE)                               | Initial `pillar.snapshot` frame uses lazy status; subsequent `pillar.health-changed` frames carry recovery transitions emitted by the heartbeat handler.                                              |

> The canonical slash paths and their legacy dotted aliases (`/core.registry.*`) are mounted to the **same** handlers (`REGISTRY_PATHS` + `LEGACY_REGISTRY_PATHS`). The registry wire is raw HTTP/SSE with bare bodies — not ts-rest, not tRPC. The SDK discovery transport reads `{ pillars, fetchedAt }` directly.

### Internal exports (consumed by the process + tests)

```ts
// pillars/registry/src/api/modules/registry/status.ts
export const HEARTBEAT_INTERVAL_MS: number;
export const MISS_THRESHOLD: number;
export const UNAVAILABLE_AFTER_MS: number;
export const HEALTHY_STALENESS_REFRESH_MS: number;
export function computeStatus(lastHeartbeatAt: Date, now: Date): 'healthy' | 'unavailable';
export function injectRegistryClock(clock: (() => Date) | null): void;
export function resetRegistryClock(): void;
export function registryNow(): Date;

// pillars/registry/src/api/modules/registry/ticker.ts
export function runHeartbeatTick(db, opts?): readonly StatusTransition[];
export function startHeartbeatTicker(db, opts?): () => void; // returns stop fn
```

`startHeartbeatTicker(coreDb.db)` is called once at boot in `pillars/registry/src/api/server.ts` (after `app.listen`); its stop function is invoked from the SIGTERM/SIGINT handler. Tests bypass the interval by calling `runHeartbeatTick` directly with an injected clock.

## Business rules

- **Miss threshold is 3, fixed.** Not env-configurable in V1. Different thresholds would be exposed via env later if operations call for it.
- **Status is computed live on every snapshot read.** The persisted `status` is a denormalised cache. The snapshot/SSE-initial-frame trust the live computation; the persisted column drives transition detection (and feeds restart reconciliation).
- **The ticker fires every 10s** — same cadence as the SDK heartbeat. Balances event latency against CPU.
- **A healthy→healthy "no-op" tick refreshes `statusUpdatedAt` once a minute.** Even with no status change, after `HEALTHY_STALENESS_REFRESH_MS` the ticker rewrites `statusUpdatedAt = now`, so the field always reflects "we know this pillar was alive as of this moment."
- **Each tick is atomic.** All transitions and refreshes for a pass go in one SQLite transaction (`applyStatusUpdates`). No two ticks race; a tick is atomic relative to a concurrent heartbeat/register, which run in their own transactions.
- **Heartbeat arrival during a tick is benign.** Worst case the tick computes `unavailable` just as a heartbeat lands; the next tick (10s later) corrects to `healthy`. One extra cycle of staleness is acceptable, and the lazy snapshot path already reports `healthy` immediately.
- **Recovery is immediate on the read path, push-event on the heartbeat path.** A heartbeat that lands on a non-`healthy` row flips persisted status to `healthy`, rewrites `statusUpdatedAt`, and the heartbeat handler emits a `health-changed` event to the in-process bus → SSE subscribers. The snapshot already reflected `healthy` the instant the heartbeat updated `lastHeartbeatAt`.
- **No retry/backoff on ticker errors.** A throwing tick is logged (or routed to `onError`); the next tick runs normally. Persistent failures surface in logs.
- **The lazy compute path is the source of truth for snapshot/SSE-snapshot responses.** Both the read path and the ticker use the same `computeStatus`, so they agree.
- **`unknown` is sticky until a heartbeat clears it.** The ticker and lazy path never compute `unknown`; only boot reconciliation writes it, and a subsequent heartbeat flips it to `healthy` (emitting `health-changed`).

## Edge cases

| Case                                                                       | Behaviour                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar registers; first heartbeat arrives 35s later (one full miss window) | Register sets `healthy` + `lastHeartbeatAt = now`. After 30s the lazy path reports `unavailable` (and the ticker persists it). The 35s heartbeat flips it back to `healthy`. Slightly noisy for slow boots; acceptable. |
| Two consecutive ticks before a heartbeat; pillar already `unavailable`     | Second tick: `computed === row.status === 'unavailable'`. No transition, no `statusUpdatedAt` touch (refresh only applies to `healthy` rows).                                                                           |
| `unavailable → healthy → unavailable` within ~10s                          | Recovery heartbeat emits one `health-changed`. Re-failure is detected by the next ticker pass (persisted) and the lazy path immediately. Subscribers handle the flutter (the subscription model's job).                 |
| `lastHeartbeatAt` in the future (clock skew, pillar ahead of registry)     | Negative age → `healthy`. Defensive; container clocks are synced.                                                                                                                                                       |
| Age exactly `UNAVAILABLE_AFTER_MS` (30000ms)                               | `30000 < 30000` is false → `unavailable`. The boundary is owned by `unavailable`.                                                                                                                                       |
| Ticker delayed under load                                                  | Snapshots in the gap use lazy compute and stay fresh. The ticker catches up; persisted transitions land with up to the delay's extra latency.                                                                           |
| Pillar deregisters during a tick                                           | The DELETE removes the row; the next pass doesn't see it. The deregister emits its own event (owned by the registry schema & endpoints and dynamic pillar registration PRDs); the ticker emits nothing for it.          |
| 30+ pillars miss heartbeats simultaneously (registry-wide hiccup)          | One tick persists a transition per missed pillar in a single transaction. No mitigation needed at this scale (tested with 2; design is O(N) for N < 100).                                                               |
| Snapshot called between a heartbeat and the next tick                      | Snapshot returns `healthy` (lazy compute) before the persisted row catches up.                                                                                                                                          |
| Registry restart kills the ticker mid-pass                                 | No corruption — each tick is its own transaction. Boot reconciliation runs before `app.listen`; the restarted ticker resumes on the next interval.                                                                      |
| `health-changed` emitted with zero SSE subscribers                         | No-op. The bus is fanout-friendly; zero listeners drops the event silently. Not an error.                                                                                                                               |
| Test wants to advance time                                                 | `injectRegistryClock(() => fixedDate)` overrides the `registryNow()` reference; `resetRegistryClock()` (or `injectRegistryClock(null)`) restores real time.                                                             |

## Acceptance criteria

- [x] `computeStatus(lastHeartbeatAt, now)` is a pure function: `healthy` while age `< 30000ms`, `unavailable` at/after, negative ages treated as `healthy`. (`registry-status.test.ts`)
- [x] `HEARTBEAT_INTERVAL_MS`/`MISS_THRESHOLD`/`UNAVAILABLE_AFTER_MS` export as `10_000`/`3`/`30_000`. (`registry-status.test.ts`)
- [x] The background ticker walks `pillar_registry`, persists `healthy → unavailable` transitions in one transaction, and returns/emits a `StatusTransition` per change. (`heartbeat.test.ts`)
- [x] A no-status-change tick emits no transition and does not touch `statusUpdatedAt` (except the healthy-staleness refresh). (`heartbeat.test.ts`)
- [x] Healthy pillars get `statusUpdatedAt` refreshed once `HEALTHY_STALENESS_REFRESH_MS` (60s) has elapsed, even with no status change. (`heartbeat.test.ts`)
- [x] The discovery snapshot computes status live from `lastHeartbeatAt`, reporting `unavailable` past the threshold even before the ticker persists it — while the persisted column still reads `healthy`. (`heartbeat.test.ts`)
- [x] A heartbeat on a non-`healthy` row flips persisted status to `healthy`, sets `statusChanged = true`, rewrites `statusUpdatedAt`, and the lazy snapshot reports `healthy`. (`heartbeat.test.ts`)
- [x] A heartbeat that recovers a pillar emits a `health-changed` event to the in-process bus → SSE subscribers. (`external-heartbeat.test.ts`)
- [x] Heartbeats are idempotent under repetition (last write wins). (`heartbeat.test.ts`)
- [x] `injectRegistryClock` / `resetRegistryClock` / `registryNow` provide a deterministic test clock. (`registry-status.test.ts`)
- [x] `startHeartbeatTicker` is started at boot in `server.ts` and stopped from the SIGTERM/SIGINT handler; the interval is `unref()`'d.
- [x] Many pillars (load): one tick emits exactly one transition per missed pillar. (`heartbeat.test.ts`)
- [ ] The **background ticker** emits `healthy → unavailable` transitions as `health-changed` push events to SSE subscribers. **Not built** — in production the ticker runs with no `onTransition` callback, so a pillar going dark is reflected only on the lazy read path; subscribers get no push until a recovery heartbeat. See [idea](../../../ideas/heartbeat-ticker-event-emission.md).

## Out of scope

- Configurable / per-pillar miss thresholds. Single global value of 3.
- Backoff on snapshot computation under load. The lazy path is O(N) over registered pillars — fine for N < 100.
- Heartbeat dedup or rate limiting. ~10s cadence; no abuse vector inside the docker network.
- Sliding-window / degraded status ("8 of last 10 succeeded"). Binary `healthy`/`unavailable`.
- Per-procedure health. Manifest-level only.
- Active probing (registry calling the pillar's `/health`). Heartbeat-driven only.
- Persistence of historical transitions. SSE events are the only record.
- Status webhooks to external systems. Events stay inside the docker network.
- Adaptive / closed-loop threshold adjustment.
- Recovery jitter / flap protection. Direct transition on heartbeat arrival.
