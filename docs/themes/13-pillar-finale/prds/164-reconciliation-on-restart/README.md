# PRD-164: Reconciliation on core-api restart

> Epic: [Central registry](../../epics/02-central-registry.md)

## Overview

The registry's behaviour when `pops-core-api` itself restarts. Persisted `pillar_registry` rows survive the restart but their `status` is stale — the registry doesn't know which pillars are actually alive until they re-register or heartbeat. PRD-164 defines the recovery flow:

1. On startup, mark every existing row's `status = 'unknown'`. Snapshot reads return `unknown` until reconciliation completes per pillar.
2. Open a **60-second reconciliation window** during which pillars are expected to re-register or heartbeat.
3. Within the window, any heartbeat or re-register flips the row to `healthy`. Pillars that don't respond within the window transition to `unavailable`.
4. **Rows that remain `unavailable` for 10 minutes are garbage-collected** by a periodic sweeper. Pillars that come back register fresh.

This PRD ships the restart-detection logic, the unknown-state semantics, and the GC sweeper. The base table + procedures are PRD-161; heartbeat detection is PRD-162; subscription events are PRD-163.

## Data Model

No new tables. PRD-164 uses the existing `pillar_registry` columns:

- `status` — gains the `'unknown'` state during reconciliation
- `status_updated_at` — anchors the 10-minute GC clock for `unavailable` rows

### Constants

```ts
// @pops/core-api/registry/constants.ts

export const RECONCILIATION_WINDOW_MS = 60_000; // 60 seconds
export const STALE_UNAVAILABLE_GC_MS = 600_000; // 10 minutes
export const GC_SWEEPER_INTERVAL_MS = 60_000; // ticker runs every minute
```

### Boot signature

```ts
// pops-core-api/src/registry/boot.ts

export async function reconcileRegistryOnBoot(opts?: { windowMs?: number }): Promise<void>;
```

Called once at core-api startup, before the HTTP server begins accepting registry mutations.

## API Surface

No new endpoints. Behaviour changes to existing procedures during reconciliation:

### `snapshot` during reconciliation

Rows with `status = 'unknown'` are returned as `unknown` in the snapshot. Consumers (PRD-159 discovery cache) treat `unknown` as "don't make optimistic calls; the pillar might be there or not." Per ADR-027 + PRD-159's `CallResult` discriminants, `unknown` callers should map to `{ kind: 'degraded', reason: 'reconciling' }` when calls are attempted during the window.

### `register` during reconciliation

Pillars that re-register inside the window UPSERT as normal — `registered_at` preserved (from the pre-restart row), `last_heartbeat_at = NOW()`, `status = 'healthy'`. Emit a `registered` event so subscribers know the pillar is back.

### `heartbeat` during reconciliation

A heartbeat for an `unknown` pillar transitions it to `healthy` and emits `health-changed`. The pillar doesn't need to re-register if its persisted row matches what it would have re-registered with — heartbeat is enough.

### Window expiry

After `RECONCILIATION_WINDOW_MS`, any row still `unknown` transitions to `unavailable` via the heartbeat ticker (PRD-162). `status_updated_at` is set to the transition time; the 10-minute GC clock starts ticking.

### GC sweeper

Runs every 60 seconds. SQL:

```sql
DELETE FROM pillar_registry
WHERE status = 'unavailable'
  AND (strftime('%s', 'now') - strftime('%s', status_updated_at)) > 600;
```

Emits a `deregistered` subscription event for each deleted row.

## Business Rules

- **Reconciliation starts at core-api boot.** The first SQL operation against `pillar_registry` is:
  ```sql
  UPDATE pillar_registry
  SET status = 'unknown', status_updated_at = NOW()
  WHERE status != 'unknown';
  ```
- **Reconciliation completes per-pillar.** Each pillar transitions out of `unknown` independently — heartbeat, register, or window expiry. There's no single global "reconciliation done" event.
- **Consumers see the reconciliation window as `unknown` status.** Discovery cache treats `unknown` as "uncertain"; SDK call results return `{ kind: 'degraded', reason: 'reconciling' }` if a consumer attempts to call an unknown pillar. PRD-159's failure path handles this gracefully.
- **The window is global, not per-pillar.** It opens at core-api boot and closes 60s later. After that, any new boot would start a new window.
- **Pillars that re-register with a different `contract.version` reset their status to `healthy`.** This is a deploy scenario: pillar was upgraded while core-api was down. The `manifest-updated` event fires.
- **The GC sweeper runs every 60 seconds.** Same cadence as the heartbeat ticker. Runs after the heartbeat ticker each cycle to ensure status is fresh before GC decisions.
- **GC only deletes rows that have been `unavailable` for 10 full minutes.** Tightens to 600 seconds (10 × 60). Operator can verify by inspecting `status_updated_at`.
- **GC emits `deregistered` events** so subscribers can reconcile their local state. From a consumer's perspective, GC is indistinguishable from a clean deregister.
- **No GC during reconciliation window.** If a row is `unknown` (reconciliation in progress), GC skips it. Only `unavailable` rows are eligible.
- **The reconciliation logic is idempotent.** Calling `reconcileRegistryOnBoot` multiple times is harmless — sets `unknown` on every row. Useful for tests that simulate restart.
- **Logging is verbose during reconciliation.** Each pillar's transition out of `unknown` is logged. Helps operators understand recovery timing.
- **No backfill of subscription events from before the restart.** Pre-restart events are lost; subscribers reconnect and get the fresh snapshot (PRD-163). The unknown-then-resolved cycle is visible in the snapshot + per-pillar events.

## Edge Cases

| Case                                                                                                         | Behaviour                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core-api restarts while a pillar is mid-register                                                             | The pillar's request fails (connection refused while core-api boots). Pillar retries per its backoff. Once core-api is up + reconciliation window opens, the retry succeeds — the row may already be `unknown` (from previous registration); UPSERT brings it back to `healthy`.  |
| Core-api restarts and a pillar never re-registers (e.g. the pillar is also down)                             | Row stays `unknown` until window expiry (60s) → `unavailable`. After 10 more minutes → GC deletes. Pillar re-registering after GC creates a fresh row.                                                                                                                            |
| Two pillars both heartbeat into the registry within the window's first second                                | Both rows transition `unknown → healthy` independently. Two `health-changed` events fire.                                                                                                                                                                                         |
| Core-api restarts, then restarts again 30s later                                                             | Second restart resets all rows to `unknown` again. Window resets. Pillars that had successfully transitioned to `healthy` between the two restarts get reset; they re-reconcile.                                                                                                  |
| GC sweeper fires during the 10-minute mark + 1 second                                                        | Row is exactly past the 10-minute boundary; gets DELETEd. Subscription event fires.                                                                                                                                                                                               |
| Pillar registers; core-api restarts immediately (within seconds)                                             | Row is `healthy` pre-restart. Reset to `unknown`. Pillar's next heartbeat (within 10s) transitions back to `healthy`. Total `unknown` window: ~10s.                                                                                                                               |
| Pillar heartbeat arrives during reconciliation but the row was never registered (db wiped, or pillar is new) | Heartbeat returns `not-registered`. Pillar SDK re-runs registration. UPSERT creates the row. Snapshot reflects it.                                                                                                                                                                |
| Reconciliation window opens but no pillars are running                                                       | Existing rows transition `unknown → unavailable` at window expiry. GC removes them 10 minutes later. Registry is empty (correct state).                                                                                                                                           |
| Manifest changed while core-api was down                                                                     | Pillar re-registers with new manifest; row UPDATEs; `manifest-updated` event fires (in addition to the implicit `registered` from coming out of `unknown`).                                                                                                                       |
| GC sweeper crashes                                                                                           | Logged; next cycle runs normally. No corruption — DELETE is atomic per row.                                                                                                                                                                                                       |
| Reconciliation window is mid-flight when a subscription consumer connects                                    | Snapshot returns rows as `unknown`; consumer sees the state explicitly. Subsequent `health-changed` events flip them to `healthy` (or window expiry flips to `unavailable`).                                                                                                      |
| Heartbeat ticker (PRD-162) fires during reconciliation                                                       | Ticker computes status from `last_heartbeat_at`; for `unknown` rows, this would compute `unavailable` (last_heartbeat is stale from pre-restart). PRD-164's logic overrides: rows in `unknown` are SKIPPED by the ticker until window expiry. Then standard ticker logic resumes. |
| Test wants to verify a specific reconciliation timeline                                                      | `reconcileRegistryOnBoot({ windowMs: 100 })` shortens the window for fast tests.                                                                                                                                                                                                  |
| Operator manually inspects the table during reconciliation                                                   | Status column shows `'unknown'` clearly; no ambiguity.                                                                                                                                                                                                                            |

## User Stories

| #   | Story                                                                           | Summary                                                                                                                                                   | Parallelisable                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 01  | [us-01-boot-reset-status](us-01-boot-reset-status.md)                           | `reconcileRegistryOnBoot` sets every row to `unknown` at startup                                                                                          | yes — independent                        |
| 02  | [us-02-window-expiry-transition](us-02-window-expiry-transition.md)             | After `RECONCILIATION_WINDOW_MS`, any row still `unknown` transitions to `unavailable` (heartbeat ticker integration)                                     | blocked by us-01 + PRD-162 us-02         |
| 03  | [us-03-ticker-skips-unknown](us-03-ticker-skips-unknown.md)                     | The heartbeat ticker skips `unknown` rows during reconciliation; status preserved until window expiry                                                     | blocked by us-01 + PRD-162 us-02         |
| 04  | [us-04-unknown-to-healthy-transitions](us-04-unknown-to-healthy-transitions.md) | Heartbeat or register flips `unknown → healthy`; appropriate events emitted                                                                               | blocked by us-01 + PRD-161 us-03 + us-04 |
| 05  | [us-05-gc-sweeper](us-05-gc-sweeper.md)                                         | Periodic sweeper that DELETEs rows `unavailable` for >10 minutes; emits `deregistered` events                                                             | blocked by us-01                         |
| 06  | [us-06-startup-wiring](us-06-startup-wiring.md)                                 | `pops-core-api/src/server.ts` calls `reconcileRegistryOnBoot` before mounting the registry router                                                         | blocked by us-01                         |
| 07  | [us-07-degraded-call-result-mapping](us-07-degraded-call-result-mapping.md)     | PRD-159 discovery cache maps `unknown` status → `{ kind: 'degraded', reason: 'reconciling' }` when consumers attempt calls                                | blocked by us-01 + PRD-159 us-04         |
| 08  | [us-08-restart-integration-tests](us-08-restart-integration-tests.md)           | Simulate restart: register pillars, restart core-api, verify reconciliation timeline (unknown → healthy via heartbeat; expiry → unavailable; GC → delete) | blocked by us-04 + us-05                 |
| 09  | [us-09-operator-logging](us-09-operator-logging.md)                             | Verbose logs on reconciliation transitions; clear "reconciliation complete in Xs" summary at window expiry                                                | blocked by us-02 + us-04                 |

## Out of Scope

- Persistent event log (replay events that happened before the restart). Subscribers reconnect; the snapshot is enough.
- Cross-instance reconciliation (multiple core-api processes coordinating). Single-instance assumption.
- Configurable GC window (e.g. per-pillar). One global value.
- Reconciliation-aware health checks (consumers explicitly waiting for reconciliation to complete). Consumers handle `unknown` gracefully via the discovery cache.
- Reconciliation timeout escalation (auto-restart core-api if reconciliation can't complete for some reason). Operator concern.
- Backward compatibility with a registry that has the old `status` enum (without `'unknown'`). Theme 13 ships everything coherently.
- Active probing of `unknown` pillars (registry tries to call `/health` on them). Heartbeat-driven only.
- Reconciliation hooks for ops dashboards. Logs + subscription events are enough.
- Multi-stage reconciliation (`unknown` → `tentative` → `healthy`). Two states only: `unknown` then resolved.
- Reconciliation across core-api version upgrades that change the schema. ADR-031's release cadence handles schema evolution; this PRD assumes the table shape is stable.
