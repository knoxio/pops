# PRD-162: Heartbeat lifecycle

> Epic: [Central registry](../../epics/02-central-registry.md)

## Overview

The registry-side logic that turns heartbeat arrivals (PRD-161's `heartbeat` mutation) into observable health state changes. Three missed heartbeats — ≈30 seconds — flips a pillar from `healthy` to `unavailable`. Detection is hybrid: snapshot reads compute status live from `last_heartbeat_at`, and a background ticker every 10s updates `status_updated_at` and emits subscription events for transitions. Recovery on heartbeat re-arrival immediately flips back to `healthy` and emits the corresponding event.

This PRD ships the runtime status engine; the persistence (`pillar_registry` table, the procedures) is PRD-161 and the subscription transport that carries the events is PRD-163.

## Data Model

### Status enum (already declared in PRD-161)

```
'healthy'      — heartbeat received within the last (interval × threshold) seconds
'unavailable'  — heartbeat NOT received within the last (interval × threshold) seconds
'unknown'      — core-api restarted; pillar hasn't re-registered yet (PRD-164)
```

### Status computation

```ts
// @pops/core-api/registry/status.ts

const HEARTBEAT_INTERVAL_MS = 10_000;
const MISS_THRESHOLD = 3;
const UNAVAILABLE_AFTER_MS = HEARTBEAT_INTERVAL_MS * MISS_THRESHOLD; // 30_000

export function computeStatus(lastHeartbeatAt: Date, now: Date): 'healthy' | 'unavailable' {
  const ageMs = now.getTime() - lastHeartbeatAt.getTime();
  return ageMs < UNAVAILABLE_AFTER_MS ? 'healthy' : 'unavailable';
}
```

### Background ticker

Runs every 10 seconds inside pops-core-api. Walks the `pillar_registry` table; for each row:

1. Compute `current = computeStatus(last_heartbeat_at, NOW())`.
2. If `current !== row.status`:
   - UPDATE `pillar_registry SET status = ?, status_updated_at = NOW() WHERE pillar_id = ?`.
   - Emit subscription event `{ type: 'health-changed', pillarId, status: current, previousStatus: row.status }`.
3. If `current === row.status` AND `row.status === 'healthy'` AND `(NOW() - row.status_updated_at) > 60s`:
   - UPDATE `status_updated_at = NOW()`. Keeps the timestamp current as a "still alive" signal.

### Lazy compute on snapshot

The `core.registry.snapshot` query (PRD-161) calls `computeStatus(last_heartbeat_at, NOW())` per row instead of returning the persisted `status` directly. This guarantees consumers see fresh status even if the background ticker is delayed by GC or load.

## API Surface

No new endpoints. PRD-162 adds behaviour to PRD-161's existing endpoints + a background process inside core-api.

### Internal exports (used by tests)

```ts
// @pops/core-api/registry

export const HEARTBEAT_INTERVAL_MS: number;
export const MISS_THRESHOLD: number;
export const UNAVAILABLE_AFTER_MS: number;
export function computeStatus(lastHeartbeatAt: Date, now: Date): 'healthy' | 'unavailable';
export function startHeartbeatTicker(opts?: { intervalMs?: number }): () => void; // returns stop fn
```

`startHeartbeatTicker` is called once at core-api boot; the stop function is invoked at SIGTERM.

## Business Rules

- **Miss threshold is 3 (not configurable in V1).** ADR-027's default. If operations call for different thresholds, expose via env later.
- **Status is computed live on every snapshot read.** Persisted `status` is a denormalised cache; the snapshot endpoint trusts the live computation. Persisted status drives subscription event emission only.
- **Background ticker fires every 10 seconds.** Same cadence as the SDK's heartbeat interval. Reasonable balance between event latency and CPU.
- **Status transitions emit subscription events.** `healthy → unavailable` and `unavailable → healthy` both fire. `unknown → healthy` fires on the first heartbeat after core-api restart (PRD-164).
- **A healthy → healthy "no-op" tick still updates `status_updated_at` periodically.** Once a minute, even if status hasn't changed, the ticker writes `status_updated_at = NOW()` so the field reflects "we know this pillar is still alive as of this moment." Used by reconciliation (PRD-164).
- **The ticker is single-threaded and atomic.** A single SQLite transaction per tick — read all rows, compute, write back transitions, emit events. No risk of two ticks racing.
- **Heartbeat arrival during a tick is fine.** The `heartbeat` mutation runs in its own transaction; the ticker reads at a different point in time. Worst case: tick computes `unavailable` just as a heartbeat updates `last_heartbeat_at`; next tick (10s later) corrects to `healthy`. Acceptable; one extra cycle of staleness.
- **The ticker is started by `pops-core-api/src/server.ts` at boot.** Stopped by the SIGTERM handler. Tests bypass it via `injectRegistryClock()` or by passing a custom `intervalMs`.
- **No retry / backoff on ticker errors.** If a tick throws (e.g. SQLite is locked), the error is logged and the next tick runs normally. Persistent failures surface in logs.
- **The lazy compute path is the source of truth for `snapshot` responses.** Subscribers receive events from the ticker. Both paths agree because they use the same `computeStatus` function.

## Edge Cases

| Case                                                                                      | Behaviour                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar registers; first heartbeat arrives 35s later (one full miss-threshold window)      | Initial register sets `status = 'healthy'` and `last_heartbeat_at = NOW()`. After 30s, ticker sees the pillar as `unavailable`. Event fires. When heartbeat arrives at 35s, status flips back to `healthy`; event fires. Slightly noisy for slow boots; acceptable. |
| Two consecutive ticks fire before a heartbeat arrives, pillar already `unavailable`       | Second tick: `current === row.status === 'unavailable'`. No event emitted. `status_updated_at` not touched (only touched on transitions OR healthy-staleness refresh).                                                                                              |
| Pillar is unavailable, then heartbeats, then immediately fails again                      | `unavailable → healthy → unavailable` within ~10 seconds. Three events emitted. Subscribers see the flutter; they handle it (PRD-163's job).                                                                                                                        |
| `last_heartbeat_at` is in the future (clock skew between pillar and core-api)             | `computeStatus` treats negative ages as healthy. Defensive but unlikely; container clocks are synced.                                                                                                                                                               |
| Pillar's `last_heartbeat_at` is exactly at the threshold (NOW - lastHeartbeat == 30000ms) | Less-than comparison means `30000 < 30000` is false → `unavailable`. Boundary owned by `unavailable`.                                                                                                                                                               |
| Ticker fires during heavy load and is delayed by 5 seconds                                | Snapshots in the meantime use lazy compute and still return fresh status. The ticker eventually catches up; transitions are detected with up to 5s extra delay. Acceptable.                                                                                         |
| Pillar deregisters during a tick                                                          | DELETE removes the row; tick's read-loop doesn't see it on the next iteration. No event for the deregister-triggered transition (deregister emitted its own event in PRD-161).                                                                                      |
| Many pillars (30+) all miss heartbeats at the same time (registry-wide network hiccup)    | Ticker emits 30 transition events in a burst. Subscribers process them. No mitigation needed at this scale.                                                                                                                                                         |
| Snapshot is called between a heartbeat arrival and the next tick                          | Snapshot returns `healthy` (lazy compute). Ticker on next pass sees the pre-heartbeat row's old status and the new last_heartbeat_at; no transition; `status_updated_at` may need a healthy-staleness refresh.                                                      |
| Core-api restart kills the ticker mid-pass                                                | No corruption: each tick is in its own SQLite transaction. Restarted ticker resumes from the next iteration.                                                                                                                                                        |
| Subscription event emission fails (no subscribers)                                        | No-op. PRD-163's event channel is fanout-friendly; zero subscribers means events are dropped silently. Not an error.                                                                                                                                                |
| Test wants to advance time                                                                | `injectRegistryClock(fakeNow)` overrides the `NOW()` reference; tests can simulate missed heartbeats without real time elapse.                                                                                                                                      |

## User Stories

| #   | Story                                                                 | Summary                                                                                                             | Parallelisable                   |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 01  | [us-01-status-compute](us-01-status-compute.md)                       | Pure function `computeStatus(lastHeartbeatAt, now)` + unit tests                                                    | yes — independent                |
| 02  | [us-02-ticker-loop](us-02-ticker-loop.md)                             | Background interval that walks `pillar_registry`, computes transitions, persists + emits events                     | blocked by us-01 + PRD-161 us-07 |
| 03  | [us-03-lazy-snapshot-compute](us-03-lazy-snapshot-compute.md)         | Update PRD-161's `snapshot` query to compute status live (not return persisted column)                              | blocked by us-01 + PRD-161 us-06 |
| 04  | [us-04-healthy-staleness-refresh](us-04-healthy-staleness-refresh.md) | Healthy pillars get `status_updated_at` refreshed every 60s by the ticker                                           | blocked by us-02                 |
| 05  | [us-05-startup-shutdown-wiring](us-05-startup-shutdown-wiring.md)     | `pops-core-api/src/server.ts` starts the ticker at boot; SIGTERM stops it                                           | blocked by us-02                 |
| 06  | [us-06-clock-injection](us-06-clock-injection.md)                     | `injectRegistryClock(fn)` for tests; default uses `() => new Date()`                                                | blocked by us-01                 |
| 07  | [us-07-recovery-tests](us-07-recovery-tests.md)                       | Integration tests: pillar healthy → ticker miss → unavailable; heartbeat arrives → healthy; event emitted each time | blocked by us-02 + us-03         |
| 08  | [us-08-load-tests](us-08-load-tests.md)                               | 50 pillars, all missing heartbeats simultaneously; verify ticker emits all 50 events within one tick window         | blocked by us-02                 |

## Out of Scope

- Configurable miss threshold via env. Fixed at 3 for now.
- Per-pillar miss-threshold tuning (some pillars more tolerant than others). Single global value.
- Backoff on snapshot computation under load. The lazy compute path is O(N) over registered pillars — fine for N < 100.
- Heartbeat dedup or rate limiting. Pillars heartbeat at ~10s intervals; no abuse vector.
- Sliding-window status (e.g. "8 of last 10 heartbeats succeeded → degraded"). Binary healthy/unavailable for now.
- Per-procedure health (e.g. "transactions.list works but transactions.create doesn't"). Manifest-level health only.
- Active probing (registry tries to call `/health` on the pillar's baseUrl to verify liveness). Heartbeat-driven only.
- Persistence of historical status transitions. Subscription events are the only record.
- Status webhook calls to external systems. Subscription events stay inside the docker network.
- Adaptive thresholds (e.g. "if last 100 misses were false positives, raise the threshold"). No closed-loop adjustment.
- Recovery jitter (pillar comes back up; flap protection delays the `healthy` event). Direct transition on heartbeat arrival.
