# Heartbeat ticker should emit `healthy → unavailable` as push events

> Origin: split out of [heartbeat-lifecycle PRD](../themes/13-pillar-finale/prds/heartbeat-lifecycle/README.md) — the one acceptance criterion the live engine does not yet satisfy.

## Problem

The registry's background heartbeat ticker (`pillars/registry/src/api/modules/registry/ticker.ts`) detects and persists `healthy → unavailable` transitions, and it _can_ surface them through an optional `onTransition` callback. But in production it is never given one:

```ts
// pillars/registry/src/api/server.ts
const stopHeartbeatTicker = startHeartbeatTicker(coreDb.db); // no onTransition
```

Consequently, when a pillar goes dark:

- The **lazy read path** reflects `unavailable` immediately (snapshot + SSE-initial `pillar.snapshot` frame recompute live).
- But **no `pillar.health-changed` SSE frame is pushed.** A long-lived subscriber that connected while the pillar was healthy gets no notification that it died — it only learns by re-reading the snapshot or reconnecting.

Recovery is asymmetric and already wired: the heartbeat handler emits `health-changed` on `unavailable/unknown → healthy`. So subscribers see pillars come _back_, but never see them _go down_ via push.

## Proposed change

Wire the ticker's `onTransition` to the in-process event bus, emitting a `health-changed` payload for each persisted transition:

```ts
const stopHeartbeatTicker = startHeartbeatTicker(coreDb.db, {
  onTransition: (t) =>
    emitRegistryEvent({ event: 'health-changed', pillarId: t.pillarId, entry: null }),
});
```

Considerations:

- **Origin on the payload.** `RegistryEventPayload.origin` is optional; the ticker only has the `StatusTransition` (`pillarId`, `previousStatus`, `nextStatus`, `at`). Either look up the row's origin before emitting, or accept the unset-origin path that pre-PRD-228 emitters already use.
- **Entry hydration.** The recovery path emits `entry: null`; an SSE consumer then re-reads or relies on the next snapshot. Decide whether down-transitions should carry the full `RegistryEntry` (it is cheap — the row is in hand during the tick) so subscribers can update without a round-trip.
- **Flutter.** A pillar that flaps `healthy → unavailable → healthy` would now push three frames. PRD-163 already states subscribers tolerate flutter, so no debounce is needed here, but confirm the SSE consumers actually do.

## Acceptance criteria

- [ ] The background ticker emits a `health-changed` event for every `healthy → unavailable` transition it persists, delivered to `GET /registry/subscribe` subscribers as a `pillar.health-changed` frame.
- [ ] A subscriber connected before a pillar goes dark receives the down-transition without re-reading the snapshot.
- [ ] Down-transition and recovery-transition payloads are shape-consistent (same `event`, `pillarId`, and `origin` handling).
- [ ] An integration test connects an SSE client, lets a registered pillar miss its heartbeat threshold, runs a tick, and asserts the client received the `health-changed` frame.
