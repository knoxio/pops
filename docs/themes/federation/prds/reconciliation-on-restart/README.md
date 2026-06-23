# Reconciliation on registry restart

> Theme: [federation](../../README.md)

## Purpose

When the `registry` pillar (`:3001`) restarts, the persisted `pillar_registry`
rows survive — but their `last_heartbeat_at` and cached `status` are stale
relative to the new boot clock. A row last written as `healthy` may belong to a
pillar that died during the outage; without intervention the registry would
serve stale `healthy` entries until the background ticker caught up.

Boot reconciliation closes that gap before the HTTP server accepts traffic. It
inspects every persisted row exactly once at startup and demotes any row whose
heartbeat is stale beyond the standard miss threshold to `unknown` — an honest
"we observed a missed heartbeat, we do not yet know if it is alive". The
heartbeat ticker and the consumer-facing degraded-call path take over from
there: a fresh heartbeat flips `unknown → healthy`; continued silence resolves
to `unavailable` via the lazy-status compute; external rows that stay
`unavailable` are eventually hard-evicted.

This is the restart-recovery half of the registry status machine. The base
table + handshake routes, the heartbeat-driven status computation, the
subscription stream, and the hard-eviction ticker are defined by their own PRDs;
this PRD owns only the boot-time `unknown` demotion and the contract that
consumers see `unknown` as a transient degraded state.

## Data model / contract

No new tables, no new columns. Reconciliation operates on the existing
`pillar_registry` row:

| Field               | Role in reconciliation                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `last_heartbeat_at` | The staleness anchor. `now − last_heartbeat_at > UNAVAILABLE_AFTER_MS` ⇒ the row is demoted. Never mutated by boot. |
| `status`            | Gains the `'unknown'` state. The full enum is `'healthy' \| 'unavailable' \| 'unknown'`.                            |
| `status_updated_at` | Stamped to the boot timestamp when a row is demoted. Untouched otherwise.                                           |

`status` is a denormalised cache. Live status is recomputed from
`last_heartbeat_at` on every read via `computeStatus`, **except** for rows
persisted as `unknown` — `unknown` is sticky on reads and only the heartbeat
ticker (a real heartbeat or window-equivalent silence) resolves it. This is why
boot demotion writes `unknown` rather than relying on lazy compute: lazy compute
would resolve a stale row straight to `unavailable`, erasing the "uncertain"
signal consumers depend on.

### Thresholds (shared with the heartbeat-status machine)

```ts
HEARTBEAT_INTERVAL_MS = 10_000; // SDK heartbeat cadence
MISS_THRESHOLD = 3;
UNAVAILABLE_AFTER_MS = 30_000; // 3 missed heartbeats — the demotion threshold
HEALTHY_STALENESS_REFRESH_MS = 60_000; // ticker bumps live-healthy rows so a
// clean restart does not falsely demote
```

Boot reconciliation reuses `UNAVAILABLE_AFTER_MS` as its default stale
threshold; there is no separate reconciliation constant. `staleThresholdMs` is
overridable per call for deterministic tests.

### Boot entry point

```ts
reconcileRegistryOnBoot(
  db,
  options?: {
    now?: Date;                 // defaults to the injected registry clock
    staleThresholdMs?: number;  // defaults to UNAVAILABLE_AFTER_MS
    onTransition?: (t: StatusTransition) => void;
    logger?: (message: string) => void;
  },
): readonly StatusTransition[];
```

Synchronous. Returns the demotions it persisted so the caller and tests can
assert without subscribing. Called once in the registry server entry point,
after `openCoreDb` and **before** `app.listen` — the registry serves no stale
`healthy` row to the first request after a restart.

A `StatusTransition` is `{ pillarId, previousStatus, nextStatus, at }`, where
`nextStatus` is always `'unknown'` for boot demotions and `at` is the boot ISO
timestamp.

## REST surface

Boot reconciliation adds **no endpoints**. It changes the state the existing
handshake/discovery surface reports immediately after a restart. The registry
dual-serves canonical slash paths and legacy dotted aliases during the
rolling-deploy window (same handler on both); the SDK prefers slash and falls
back to dotted on 404.

| Operation  | Canonical                       | Legacy alias                     | Behaviour after a restart                                                                                             |
| ---------- | ------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| snapshot   | `GET /registry/pillars`         | `GET /core.registry.list`        | Demoted rows report `status: "unknown"` until a heartbeat or re-register resolves them. Raw `{ pillars, fetchedAt }`. |
| register   | `POST /registry/register`       | `POST /core.registry.register`   | A re-register UPSERTs the row back to `healthy`; `registered_at` preserved, `last_heartbeat_at = now`.                |
| heartbeat  | `POST /registry/heartbeat`      | `POST /core.registry.heartbeat`  | A heartbeat for an `unknown` row refreshes `last_heartbeat_at`; the next ticker pass resolves it to `healthy`.        |
| deregister | `POST /registry/deregister`     | `POST /core.registry.deregister` | Unchanged.                                                                                                            |
| subscribe  | `GET /registry/subscribe` (SSE) | —                                | Snapshot frame reports `unknown` rows explicitly; later `health-changed` events flip them as they resolve.            |

### Consumer contract (`unknown` is degraded, not down)

The cross-pillar SDK client treats discovery `status: "unknown"` as a transient
degraded state, distinct from `unavailable`:

```ts
// guardAvailability in the SDK client factory
if (discovered.status === 'unavailable') return { kind: 'unavailable', pillar };
if (discovered.status === 'unknown') return { kind: 'degraded', pillar, reason: 'reconciling' };
```

A consumer attempting a call against a reconciling pillar receives
`{ kind: 'degraded', reason: 'reconciling' }` rather than a hard
`unavailable` — the failure path stays graceful while the registry recovers.

## Rules

- **Boot demotion is per-row and threshold-gated.** Only rows whose heartbeat is
  _strictly_ staler than the threshold are demoted. Rows within the live window
  (their next heartbeat is due within ~10s) are left untouched — a clean restart
  where pillars are still up demotes nothing, because the ticker keeps
  `status_updated_at` fresh on live-healthy rows via
  `HEALTHY_STALENESS_REFRESH_MS`.
- **The boundary is exclusive.** A row aged exactly `UNAVAILABLE_AFTER_MS` is
  not demoted; only `age > threshold` flips.
- **Demotion targets `unknown`, never `unavailable`.** A missed heartbeat across
  an outage is ambiguous: the pillar may be alive and simply could not reach a
  down registry. `unknown` records that ambiguity; the ticker resolves it.
- **Idempotent.** Re-running on already-`unknown` rows is a no-op (a row already
  `unknown` is skipped). Tests simulate restart by calling it repeatedly.
- **`last_heartbeat_at` is never mutated.** Only `status` and
  `status_updated_at` change on a demotion. The original heartbeat timestamp is
  preserved so the ticker's subsequent compute remains correct.
- **Resolution is per-pillar.** Each row leaves `unknown` independently —
  heartbeat, re-register, or ticker-computed `unavailable`. There is no single
  global "reconciliation done" signal.
- **Empty registry is a no-op.** Zero rows ⇒ zero transitions, no throw.
- **Single-instance assumption.** One registry process owns the table; there is
  no cross-instance reconciliation handshake.
- **Logs one summary line.** `boot reconciliation: N pillar(s) inspected, M
marked unknown (stale heartbeat > Xms)` via the injectable `logger` (default
  `console.warn`).

## Edge cases

| Case                                                                | Behaviour                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registry restarts; pillar is still alive and heartbeating           | Row was live-`healthy` with fresh `status_updated_at`; if its last heartbeat is within `UNAVAILABLE_AFTER_MS` it is left alone, otherwise demoted to `unknown` and the pillar's next heartbeat (≤10s) resolves it. |
| Registry restarts; pillar is also down                              | Row is demoted to `unknown`. No heartbeat arrives; the ticker eventually computes `unavailable`. If external, the eviction ticker removes it after the eviction threshold.                                         |
| Registry restarts twice in quick succession                         | Second boot re-runs demotion. Rows already `unknown` are skipped (idempotent); rows that resolved to `healthy` between boots and are still fresh stay `healthy`.                                                   |
| Pillar re-registers inside the recovery window                      | UPSERT: `registered_at` preserved, `last_heartbeat_at = now`, `status = healthy`. Snapshot reflects it immediately.                                                                                                |
| Heartbeat arrives for a pillar that was never registered (db wiped) | Heartbeat path reports not-registered; the pillar SDK re-runs registration; UPSERT creates the row.                                                                                                                |
| Consumer connects mid-recovery                                      | Snapshot reports the row as `unknown`; an attempted call returns `{ kind: 'degraded', reason: 'reconciling' }`. Later `health-changed` events flip it.                                                             |
| Operator inspects the table during recovery                         | `status` column reads `'unknown'` — unambiguous.                                                                                                                                                                   |
| Test wants a deterministic timeline                                 | `reconcileRegistryOnBoot(db, { now, staleThresholdMs })` drives the demotion synchronously without real timers.                                                                                                    |

## Acceptance criteria

- [x] `reconcileRegistryOnBoot` demotes every row aged strictly beyond
      `UNAVAILABLE_AFTER_MS` to `status = 'unknown'`, stamping `status_updated_at`
      to the boot timestamp.
- [x] Rows within the threshold are left untouched.
- [x] The threshold boundary is exclusive — a row aged exactly the threshold is
      not demoted.
- [x] `last_heartbeat_at` is never mutated; only `status` and
      `status_updated_at` change.
- [x] Re-running on already-`unknown` rows is a no-op (idempotent).
- [x] `staleThresholdMs` overrides the default threshold for tests.
- [x] Each demotion is forwarded through the `onTransition` callback and
      returned in the result array.
- [x] An empty registry produces zero transitions and does not throw.
- [x] The registry server calls `reconcileRegistryOnBoot` once, before
      `app.listen`.
- [x] `status = 'unknown'` survives lazy-status compute on reads — the snapshot
      reports `unknown` rather than collapsing it to `unavailable`.
- [x] The SDK client maps discovery `status: "unknown"` to
      `{ kind: 'degraded', reason: 'reconciling' }`.
- [x] The heartbeat ticker refreshes `status_updated_at` on live-healthy rows
      (`HEALTHY_STALENESS_REFRESH_MS`) so a clean restart does not falsely demote.
- [x] A summary line is logged per boot pass via the injectable logger.

## Out of scope

- A fixed 60-second global reconciliation window with a single open/close
  lifecycle. The implemented model is per-row threshold demotion, not a timed
  window — see [the idea note](../../../../ideas/reconciliation-on-restart.md).
- Boot reconciliation emitting `registered`/`health-changed`/`deregistered`
  subscription events. It returns transitions and exposes `onTransition`, but the
  server does not currently fan them onto the SSE bus — deferred, see the idea
  note.
- A dedicated 10-minute garbage-collection sweeper keyed off `status_updated_at`
  with its own constants. Row removal is handled by the external-pillar eviction
  ticker (5-minute threshold, external-origin rows only) defined in the
  eviction PRD, not by this PRD.
- Persistent event replay of pre-restart subscription events. Subscribers
  reconnect and read the fresh snapshot.
- Cross-instance / multi-region reconciliation. Single-instance assumption.
- Active probing of `unknown` pillars (registry calling their `/health`).
  Heartbeat-driven only.
- Multi-stage reconciliation (`unknown → tentative → healthy`). Two outcomes:
  `unknown`, then resolved.
