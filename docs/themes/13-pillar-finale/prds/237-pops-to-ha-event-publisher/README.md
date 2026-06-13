# PRD-237: pops → HA outbound event publisher

> Epic: [Bridge pillars](../../epics/13-bridge-pillars.md)

> Status: Not started

> ADR: [ADR-034](../../../../architecture/adr-034-sinks-manifest-dimension.md), [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md)

## Overview

Wire the HA bridge pillar (PRD-229) as the first real consumer of the `sinks` manifest dimension scaffolded by [PRD-236](../236-sinks-manifest-dimension/README.md). When any source pillar calls `publishEvent('media.watch.completed', payload)`, the orchestrator routes to the HA bridge's `POST /_sinks/media.watch.completed`, and the bridge translates the payload into a Home Assistant `event.fire` WebSocket call.

This PRD closes the loop on the bidirectional bridge model declared by [ADR-034](../../../../architecture/adr-034-sinks-manifest-dimension.md): inbound flow (HA → POPS) was scaffolded by PRD-229 US-01; outbound flow (POPS → HA) lands here. The deliverable is one end-to-end mapping path proven in tests against an in-process registry + stub HA WebSocket, plus a small mapping config so additional event types can be added without code changes to the bridge's core. A live HA instance is available for integration validation (the operator runs HA on a homelab node), but no test in this PRD depends on it.

## Data Model

No database surface. The artifacts are:

1. A manifest extension on `apps/pops-ha-bridge-api` declaring one or more `sinks.descriptors` entries.
2. A mapping config file shipped with the bridge that maps each POPS `eventType` to an HA event name and a payload transform.
3. Reuse of the WebSocket client + reconnect state machine already shipped by PRD-229 US-01 — no new persistent state.

### Mapping config shape

| Field             | Type                                                        | Notes                                                                                                                                           |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `eventType`       | `string`                                                    | POPS event type — must match `<source>.<entity>.<action>` per PRD-236.                                                                          |
| `haEventName`     | `string`                                                    | HA event name forwarded over the WebSocket `fire_event` message (`pops_media_watch_completed`, `pops_finance_balance_low`).                     |
| `transformInline` | `(payload) => Record<string, unknown>`                      | Pure function that maps the POPS payload to the `event_data` object HA receives. Defaults to identity when omitted.                             |
| `schema`          | `Record<string, unknown>` (JSON-Schema-shaped, per PRD-231) | The same `schema` the bridge declares in its manifest `sinks.descriptors` entry. Used by both manifest validation and the inbound 400 boundary. |

The config lives at `apps/pops-ha-bridge-api/src/sinks/mappings.ts` as a typed `SinkMapping[]` array. Adding a new mapping = adding an entry + adding a contract test asserting the round-trip. No core-code edit required.

### First-cut mappings shipped by this PRD

| POPS `eventType`          | HA event name                  | Notes                                                                                         |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `media.watch.completed`   | `pops_media_watch_completed`   | Payload identity-mapped. Use case: HA automation rings the lights down when a movie finishes. |
| `finance.balance.low`     | `pops_finance_balance_low`     | Payload identity-mapped. Use case: HA notification when an account drops below the threshold. |
| `inventory.item.consumed` | `pops_inventory_item_consumed` | Payload identity-mapped. Use case: HA shopping-list automation tops up consumables.           |

## API Surface

### Manifest extension on `pops-ha-bridge-api`

The pillar's existing manifest gains a `sinks` block whose `descriptors` array is derived from the mapping config at boot:

```ts
sinks: {
  descriptors: mappings.map(m => ({
    eventType: m.eventType,
    description: m.description,
    schema: m.schema,
  })),
}
```

No new HTTP endpoint surface beyond what PRD-236 US-03 already specifies (`POST /_sinks/<eventType>`). Each mapping wires `createSinkHandler({ eventType, schema, handler })` where `handler` runs the transform and pushes the result onto the HA WebSocket via the existing connection-managed `sendFireEvent(haEventName, eventData)` helper.

### Bridge-side handler contract

| Aspect      | Value                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger     | `POST /_sinks/<eventType>` from the orchestrator dispatcher (PRD-236 US-02).                                                                                                                                                                                                |
| Validation  | Zod schema (registered in-process at boot from the mapping `schema` field) — invalid payloads return `400` per the PRD-236 helper contract.                                                                                                                                 |
| HA delivery | The handler calls `sendFireEvent(mapping.haEventName, mapping.transformInline(payload))`. The helper queues the message when the WebSocket is `reconnecting` and flushes on reconnect. When the WebSocket is `offline` for more than the queue cap, the queue drops oldest. |
| Success     | `200 OK` once the WebSocket frame is written (or queued).                                                                                                                                                                                                                   |
| Failure     | Handler throws — surfaces `500` to the dispatcher per PRD-236; dispatcher records `pillar-offline`. Caller retries per its own retry loop (publisher concern, per ADR-034).                                                                                                 |

### No publisher-side API change

Source pillars (media, finance, inventory) call `publishEvent('media.watch.completed', payload, ...)` per PRD-236 US-02. This PRD does not introduce a new publisher API; it relies on the existing one. The publisher does not know HA exists.

## Business Rules

- **One mapping per `eventType` per bridge.** A second mapping for the same POPS `eventType` in the same bridge config is a config error — the boot-time validator throws. Two pillars _can_ declare sinks for the same `eventType` (per PRD-236 edge case); two mappings inside the HA bridge for the same `eventType` cannot.
- **The mapping config is the source of truth for both manifest and runtime.** The manifest's `sinks.descriptors` array is derived from the same `mappings` array that the runtime handler registry reads from. Drift is structurally impossible.
- **Transforms are pure functions.** Mapping `transformInline` must be synchronous, deterministic, side-effect-free. No I/O, no clock reads (use the payload's `occurredAt` if a timestamp is needed in the HA event). Enforced by code review and by a contract test that calls each transform twice with the same input and asserts deep equality.
- **WebSocket offline does not block the sink handler.** When the HA WebSocket is `reconnecting`, `sendFireEvent` enqueues; the handler returns `200`. When the WebSocket is `offline` and the queue cap is hit, the handler still returns `200` (and the oldest enqueued message is dropped with a structured log line). This honours the at-least-once contract from ADR-034 — the publisher does not see a 500 just because HA is temporarily down. A separate ops metric counts dropped messages.
- **Reconnect reuses PRD-229 US-01 backoff.** No new reconnect logic. The outbound queue is owned by the same WebSocket-client module; flush-on-reconnect is part of that module's lifecycle.
- **Idempotency is the receiver's concern.** ADR-034 pins at-least-once. The bridge does not dedupe — every dispatched event becomes an HA event. Automations that mutate state on receipt (turn a light on) must tolerate duplicate fires within a small window. Documented in the mapping config's per-entry description.
- **`event_data` is whatever the transform returns.** No envelope, no metadata injection. If a mapping needs the POPS event type echoed into the HA `event_data`, its transform spells that out. Keeps the cross-language wire contract (PRD-231) tight.
- **No per-user policy.** The first cut is 1:1 fan-out — every published event of the matched type produces exactly one HA event. Filtering, per-user routing, or per-area gating is deferred (see Out of Scope).

## Edge Cases

| Case                                                            | Behaviour                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA WebSocket disconnected at dispatch time                      | Sink handler enqueues via the PRD-229 US-01 reconnect queue, returns `200`. Queue flushes on reconnect. At-least-once preserved.                                                                                                                |
| HA WebSocket offline past queue cap                             | Oldest queued event dropped with a structured warning log (`eventType`, `queueDepth`, `droppedAt`). Handler still returns `200` — publisher does not retry. Ops metric `ha_sink_dropped_total{event_type}` increments.                          |
| HA rejects the `fire_event` frame (auth required, invalid name) | WebSocket client surfaces the error; handler logs it and returns `200` — the publisher is not the right caller to retry, and the error is operator-actionable. Health endpoint reflects the underlying connection state per PRD-229.            |
| Mapping transform throws                                        | Handler surfaces the exception → `500` to dispatcher → `pillar-offline` failure record. This is a code bug in the transform — flagged by the contract test, not expected in production.                                                         |
| Payload passes the publisher-side Zod but fails the bridge-side | Both schemas are derived from the same mapping `schema`. A mismatch is a deployment / version-skew bug. The bridge returns `400`; dispatcher records `pillar-offline`; ops follow up. Manifest validator catches the common case at boot.       |
| Two published events arrive concurrently                        | Each runs the handler independently. `sendFireEvent` serialises writes onto the single WebSocket; there is no ordering guarantee across event types, only FIFO within a single mapping's queued backlog after a reconnect.                      |
| Source pillar emits an `eventType` no mapping covers            | Per PRD-236, the orchestrator only routes to bridges that declare a matching `sinks` descriptor. The HA bridge never sees the event. Inert; no error.                                                                                           |
| Mapping config has a syntactically invalid `eventType`          | Boot-time manifest validator rejects via the PRD-236 US-01 regex (`<source>.<entity>.<action>`). Pillar fails to start with a structured error pointing at the offending entry.                                                                 |
| Cerebrum publishes during HA bridge cold start                  | Until the bridge registers + the registry snapshot refreshes, the bridge is invisible to the orchestrator — the event has zero subscribers. PRD-236 edge case ("brand-new sink may miss the first few events") applies. Acceptable per ADR-034. |

## User Stories

| #   | Story                                                             | Summary                                                                                                                                                                                          | Parallelisable   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 01  | [us-01-mapping-config-manifest](us-01-mapping-config-manifest.md) | Add the `SinkMapping` type, the first-cut mappings array, derive the manifest `sinks.descriptors` block from it at boot, wire `createSinkHandler` per mapping into the bridge's HTTP surface.    | Foundation       |
| 02  | [us-02-ws-fire-event-and-e2e](us-02-ws-fire-event-and-e2e.md)     | Implement `sendFireEvent(haEventName, eventData)` on the WebSocket client with reconnect-queue support, plus an end-to-end test (in-process registry + stub HA WS) that proves one full mapping. | Blocked by us-01 |

## Out of Scope

- **Outbound HA service calls (`ha.entity.callService`).** That flow is the `aiTools` dimension — see PRD-229 US-04. Sinks are for event-bus-shaped fan-out, not RPC-shaped commands.
- **Per-user / per-area filtering of outbound events.** First cut is 1:1 fan-out. A future PRD can add a `condition` field to the mapping config once a real use case demands it.
- **Bidirectional payload schema sharing across languages.** PRD-231 owns the cross-language wire-format spec; this PRD consumes whatever JSON-Schema shape PRD-236 lands on.
- **Persistent durable queue.** The reconnect queue is in-process and bounded. A future ADR can revisit if at-least-once-under-restart becomes a hard requirement.
- **Replay / backfill of historical POPS events into HA.** Sinks deliver live events from the moment of subscription. No history catch-up.
- **MQTT / ESPHome equivalents.** Those bridges land in their own PRDs once the HA shape is proven here.
- **HA Automation editor integration.** The bridge fires HA events; the operator wires HA-side automations against `pops_*` event names by hand. No `automation.yaml` generation in scope.
