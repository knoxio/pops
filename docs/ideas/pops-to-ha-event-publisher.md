# Idea: POPS → Home Assistant event publisher

> Status: Future — no code yet. Build alongside (or just after) the [HA bridge pillar](ha-bridge-pillar.md), once we want POPS events to drive HA automations.

## The idea

Wire the [HA bridge pillar](ha-bridge-pillar.md) as the first real consumer of POPS's `sinks` manifest dimension. When any source pillar calls `publishEvent('media.watch.completed', payload)`, the orchestrator routes to every pillar declaring a matching sink — including the HA bridge's `POST /_sinks/media.watch.completed` — and the bridge translates the payload into a Home Assistant `fire_event` WebSocket call.

This closes the loop on the bidirectional bridge model: inbound flow (HA → POPS) is the bridge's entity mirror; outbound flow (POPS → HA) lands here. The deliverable is one end-to-end mapping path proven against an in-process registry + stub HA WebSocket, plus a small mapping config so additional event types can be added without touching the bridge's core. A live HA instance (homelab node) is available for manual smoke-testing, but no test depends on it.

The `sinks` mechanism itself — `createSinkHandler`, the `publishEvent` orchestrator dispatcher, the `POST /_sinks/<eventType>` endpoint convention, and the `sinks.descriptors` manifest block — already exists in the pillar SDK (`@pops/pillar-sdk`). This idea consumes that mechanism; it does not re-derive it.

## Data model

No database surface. The artifacts are:

1. A manifest extension on the HA bridge declaring one or more `sinks.descriptors` entries.
2. A mapping config file shipped with the bridge that maps each POPS `eventType` to an HA event name and a payload transform.
3. Reuse of the WebSocket client + reconnect state machine the bridge already owns — no new persistent state.

### Mapping config shape

| Field             | Type                                    | Notes                                                                                                                                        |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `eventType`       | `string`                                | POPS event type — must match `<source>.<entity>.<action>`.                                                                                   |
| `haEventName`     | `string`                                | HA event name forwarded over the WebSocket `fire_event` message (`pops_media_watch_completed`).                                              |
| `transformInline` | `(payload) => Record<string, unknown>`  | Pure function mapping the POPS payload to the `event_data` object HA receives. Defaults to identity.                                         |
| `schema`          | `Record<string, unknown>` (JSON-Schema) | The same `schema` the bridge declares in its manifest `sinks.descriptors` entry; used by manifest validation and the inbound `400` boundary. |
| `description`     | `string`                                | Human-readable note, surfaced in the descriptor and in per-entry docs.                                                                       |

The config lives at `pillars/ha-bridge/src/sinks/mappings.ts` as a typed `SinkMapping[]` array. Adding a new mapping = adding an entry + adding a contract test asserting the round-trip. No core-code edit required.

### First-cut mappings

| POPS `eventType`          | HA event name                  | Use case                                                   |
| ------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `media.watch.completed`   | `pops_media_watch_completed`   | HA automation rings the lights down when a movie finishes. |
| `finance.balance.low`     | `pops_finance_balance_low`     | HA notification when an account drops below the threshold. |
| `inventory.item.consumed` | `pops_inventory_item_consumed` | HA shopping-list automation tops up consumables.           |

All three are identity-mapped payloads in the first cut.

## API surface

### Manifest extension on the HA bridge

The bridge's manifest gains a `sinks` block whose `descriptors` array is derived from the mapping config at boot:

```ts
sinks: {
  descriptors: mappings.map((m) => ({
    eventType: m.eventType,
    description: m.description,
    schema: m.schema,
  })),
}
```

No new HTTP endpoint surface beyond the `POST /_sinks/<eventType>` convention the SDK already provides. Each mapping wires `createSinkHandler({ eventType, schema, handler })`, where `handler` runs the transform and pushes the result onto the HA WebSocket via the bridge's connection-managed `sendFireEvent(haEventName, eventData)` helper.

### Bridge-side handler contract

| Aspect      | Value                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger     | `POST /_sinks/<eventType>` from the orchestrator dispatcher.                                                                                                                                                                                      |
| Validation  | Zod schema (registered in-process at boot from the mapping `schema` field) — invalid payloads return `400`.                                                                                                                                       |
| HA delivery | The handler calls `sendFireEvent(mapping.haEventName, mapping.transformInline(payload))`. The helper queues the message when the WebSocket is `reconnecting` and flushes on reconnect. When `offline` past the queue cap, the queue drops oldest. |
| Success     | `200 OK` once the WebSocket frame is written (or queued).                                                                                                                                                                                         |
| Failure     | Handler throws → `500` to the dispatcher; dispatcher records `pillar-offline`. The caller retries per its own loop (publisher concern).                                                                                                           |

### No publisher-side API change

Source pillars (media, finance, inventory) call `publishEvent('media.watch.completed', payload)` against the existing orchestrator dispatcher. This idea introduces no new publisher API — the publisher does not know HA exists.

## Rules

- **One mapping per `eventType` per bridge.** A second mapping for the same `eventType` in the same bridge config is a config error — the boot-time validator throws. (Two different pillars may declare sinks for the same `eventType`; two mappings inside the HA bridge for the same one may not.)
- **The mapping config is the source of truth for both manifest and runtime.** The manifest's `sinks.descriptors` array is derived from the same `mappings` array the runtime handler registry reads. Drift is structurally impossible.
- **Transforms are pure functions.** `transformInline` must be synchronous, deterministic, side-effect-free — no I/O, no clock reads (use the payload's `occurredAt` if a timestamp is needed). Enforced by code review and by a contract test that calls each transform twice with the same input and asserts deep equality.
- **WebSocket offline does not block the sink handler.** While `reconnecting`, `sendFireEvent` enqueues and the handler returns `200`. When `offline` and the queue cap is hit, the handler still returns `200` (oldest enqueued message dropped with a structured log line). This honours at-least-once — the publisher does not see a `500` just because HA is temporarily down. A separate ops metric counts dropped messages.
- **Reconnect reuses the bridge's existing backoff.** No new reconnect logic. The outbound queue is owned by the same WebSocket-client module; flush-on-reconnect is part of that module's lifecycle.
- **Idempotency is the receiver's concern.** At-least-once delivery: the bridge does not dedupe — every dispatched event becomes an HA event. Automations that mutate state on receipt must tolerate duplicate fires within a small window. Documented per mapping entry.
- **`event_data` is whatever the transform returns.** No envelope, no metadata injection. If a mapping needs the POPS event type echoed into HA `event_data`, its transform spells that out.
- **No per-user policy.** First cut is 1:1 fan-out — every published event of the matched type produces exactly one HA event. Filtering, per-user routing, or per-area gating is deferred.

## Edge cases

| Case                                                            | Behaviour                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA WebSocket disconnected at dispatch time                      | Sink handler enqueues via the bridge's reconnect queue, returns `200`. Queue flushes on reconnect. At-least-once preserved.                                                                                                 |
| HA WebSocket offline past queue cap                             | Oldest queued event dropped with a structured warning (`eventType`, `queueDepth`, `droppedAt`). Handler still returns `200`. Ops metric `ha_sink_dropped_total{event_type}` increments.                                     |
| HA rejects the `fire_event` frame (auth required, invalid name) | WebSocket client surfaces the error; handler logs it and returns `200` — the publisher is not the right caller to retry; the error is operator-actionable. Connection health reflects the underlying state.                 |
| Mapping transform throws                                        | Handler surfaces the exception → `500` to dispatcher → `pillar-offline` record. A code bug in the transform — flagged by the contract test, not expected in production.                                                     |
| Payload passes the publisher-side zod but fails the bridge-side | Both schemas derive from the same mapping `schema`; a mismatch is a version-skew bug. The bridge returns `400`; dispatcher records `pillar-offline`. The manifest validator catches the common case at boot.                |
| Two published events arrive concurrently                        | Each runs the handler independently. `sendFireEvent` serialises writes onto the single WebSocket; no ordering guarantee across event types, only FIFO within a single mapping's queued backlog after a reconnect.           |
| Source pillar emits an `eventType` no mapping covers            | The orchestrator only routes to bridges that declare a matching `sinks` descriptor; the HA bridge never sees the event. Inert; no error.                                                                                    |
| Mapping config has a syntactically invalid `eventType`          | Boot-time manifest validator rejects via the `<source>.<entity>.<action>` regex. The pillar fails to start with a structured error pointing at the offending entry.                                                         |
| Cerebrum publishes during HA bridge cold start                  | Until the bridge registers and the registry snapshot refreshes, the bridge is invisible to the orchestrator — the event has zero subscribers. A brand-new sink may miss the first few events; acceptable for at-least-once. |

## What "built" looks like

Forward-looking acceptance criteria. None are implemented yet.

### Mapping config + manifest derivation + sink-handler wiring (foundation)

- [ ] A `SinkMapping` type lives at `pillars/ha-bridge/src/sinks/types.ts` with fields `eventType`, `description`, `haEventName`, `schema`, and `transformInline` (optional; defaults to identity).
- [ ] A `mappings: SinkMapping[]` array at `pillars/ha-bridge/src/sinks/mappings.ts` ships the three first-cut entries (`media.watch.completed`, `finance.balance.low`, `inventory.item.consumed`) with valid zod-paired JSON-Schema payload contracts.
- [ ] The bridge's manifest derives its `sinks.descriptors` block from `mappings.map((m) => ({ eventType, description, schema }))` — no hand-maintained second list of event types.
- [ ] For each mapping, the bridge HTTP layer wires `createSinkHandler({ eventType, schema, handler })` from `@pops/pillar-sdk` and mounts it at `POST /_sinks/<eventType>`.
- [ ] A boot-time validator rejects duplicate `eventType` entries with a structured error pointing at the offending entries.
- [ ] A unit test asserts every mapping's `eventType` matches the `<source>.<entity>.<action>` regex.
- [ ] A unit test asserts every `transformInline` is pure: same input → deep-equal output across two consecutive calls.
- [ ] A unit test asserts the manifest `sinks.descriptors` block is exactly `mappings.length` long and round-trips each `eventType`.

### `sendFireEvent` + reconnect queue + end-to-end mapping test

- [ ] `sendFireEvent(haEventName: string, eventData: Record<string, unknown>): Promise<void>` is implemented on the bridge's WebSocket-client module (the same module that owns the inbound subscriber + reconnect loop).
- [ ] When `connected`, `sendFireEvent` writes the HA `fire_event` frame and resolves once it is on the wire.
- [ ] When `reconnecting`, `sendFireEvent` enqueues onto a bounded in-memory queue (cap via `HA_SINK_QUEUE_CAP`, default 100) and resolves immediately.
- [ ] When the queue is at cap, the oldest enqueued message is dropped, a structured warning logs `{ eventType, queueDepth, droppedAt }`, and `ha_sink_dropped_total{event_type}` increments.
- [ ] On reconnect, the queue flushes in FIFO order before any new `sendFireEvent` is accepted onto the live socket.
- [ ] An end-to-end test constructs an in-process registry with the HA bridge manifest, calls `publishEvent('media.watch.completed', samplePayload)`, and asserts the stub HA WS receives exactly one `fire_event` frame whose `event_type === 'pops_media_watch_completed'` and whose `event_data` deep-equals the transformed payload.
- [ ] The same E2E test covers the reconnect-queue path: force the WebSocket into `reconnecting`, call `publishEvent`, assert the stub HA WS receives nothing yet; after reconnect, assert it receives the queued frame.
- [ ] The E2E test asserts a payload failing the mapping's zod schema is rejected with `400` at the bridge boundary and recorded as `pillar-offline` in the dispatcher result — no HA frame is sent.

> The end-to-end test is the linchpin: if it passes, the bidirectional bridge model is proven. The stub HA WebSocket is an in-process `ws` server on a random port — no external HA dependency in CI.

## Out of scope (first cut)

- **Outbound HA service calls (`ha.entity.callService`).** That is the `aiTools` dimension on the bridge, not a sink. Sinks are for event-bus-shaped fan-out, not RPC-shaped commands.
- **Per-user / per-area filtering.** First cut is 1:1 fan-out. A future idea can add a `condition` field once a real use case demands it.
- **Persistent durable queue.** The reconnect queue is in-process and bounded. Revisit if at-least-once-under-restart becomes a hard requirement.
- **Replay / backfill of historical POPS events into HA.** Sinks deliver live events from the moment of subscription; no history catch-up.
- **MQTT / ESPHome equivalents.** Those bridges land in their own ideas once the HA shape is proven.
- **HA automation-editor integration.** The bridge fires HA events; the operator wires HA-side automations against the `pops_*` event names by hand. No `automation.yaml` generation.
