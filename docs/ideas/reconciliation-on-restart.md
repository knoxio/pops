# Reconciliation on restart — unbuilt extensions

Captures the parts of the original restart-reconciliation spec that the shipped
registry does **not** implement. The built behaviour (per-row `unknown` demotion
on boot + the `degraded/reconciling` consumer contract) lives in
[the PRD](../themes/federation/prds/reconciliation-on-restart.md). What
follows was specified but never built — the implementation chose a simpler,
threshold-driven model instead.

## 1. Fixed 60-second reconciliation window

The original design opened a single global 60s window at boot during which all
rows were `unknown`, then expired the window to flip survivors to `unavailable`.

The shipped model has no window. Boot demotion is per-row and gated on
`UNAVAILABLE_AFTER_MS` (30s of missed heartbeats), and rows leave `unknown`
independently via heartbeat / re-register / ticker compute. There is no global
open/close lifecycle, no `RECONCILIATION_WINDOW_MS` constant, and no
"reconciliation complete in Xs" summary.

Build only if operators need a bounded, observable recovery phase with a single
"recovery done" signal — e.g. to gate a readiness probe or a deploy step.
Requires: a window-state machine, a window-expiry transition that flips residual
`unknown → unavailable`, and the ticker explicitly skipping `unknown` rows until
expiry.

## 2. Boot reconciliation emits subscription events

`reconcileRegistryOnBoot` returns its transitions and accepts an `onTransition`
callback, but the registry server does not wire that callback onto the SSE event
bus. Subscribers connected across a restart see the demotions only by re-reading
the snapshot, not as live `health-changed` events.

Build by passing an `onTransition` that calls `emitRegistryEvent` for each boot
demotion. Decide first whether a flood of `unknown` events on every restart is
useful signal or just noise for subscribers that already re-snapshot on
reconnect.

## 3. Dedicated 10-minute GC sweeper

The original spec described a sweeper running every 60s that `DELETE`s any row
`unavailable` for >10 minutes (keyed off `status_updated_at`), emitting a
`deregistered` event per deleted row, with its own
`STALE_UNAVAILABLE_GC_MS` / `GC_SWEEPER_INTERVAL_MS` constants.

The shipped registry removes rows via the external-pillar eviction ticker
instead: external-origin rows only, a 5-minute threshold, a 30s tick, emitting
`deregistered` with `never-heartbeated` / `lost-heartbeat` reasons. Internal
rows are never hard-evicted. The numbers, scope, and reason taxonomy differ from
the original GC design.

Revisit only if internal-origin rows ever need automatic removal, or if the
10-minute / 60s cadence is genuinely required over the existing 5-minute / 30s
eviction. Today the eviction ticker covers the real need.
