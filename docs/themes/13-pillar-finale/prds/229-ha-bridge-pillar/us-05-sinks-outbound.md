# US-05: `sinks` manifest dimension for outbound events

> PRD: [HA bridge pillar](README.md)

## Description

As another POPS pillar (e.g. `pops-cerebrum-api` emitting a notification, or `pops-finance-api` raising a "low balance" event), I want to publish that event to a named sink (`ha.notify`, `ha.event.fire`) and have the HA bridge forward it to HA so that POPS-originated signals reach the user through HA's existing notification surfaces (mobile app, persistent_notification, automations).

## Acceptance Criteria

- [x] The pillar's manifest declares both ha-native sinks alongside the PRD-237 mappings: `ha.notify.send` and `ha.event.fire` are projected into `sinks.descriptors` via the same mapping config.
- [x] The central registry exposes the `sinks` dimension to discovery clients (additive to existing dimensions, via PRD-237's manifest projection).
- [x] `ha.notify.send` schema: `{ service?: string; message: string; title?: string; target?: string | string[]; data?: Record<string, unknown> }`. Default service: `notify`. The bridge translates to `call_service` on `notify.<service>` with the supplied target.
- [x] `ha.event.fire` schema: `{ eventType: string; eventData?: Record<string, unknown> }`. The bridge translates to a `fire_event` WebSocket frame with the publisher-supplied `event_type` and `event_data`.
- [x] A sink invocation reuses the PRD-237 outcome shape: 200 with `{ outcome: 'sent' | 'queued' }`, 400 with `{ error: 'invalid-payload', issues }`. Frames are accepted while reconnecting and drained on the next handshake.
- [x] Sink invocations are validated against the published Zod schema before they hit HA. Invalid payload → 400 `{ error: 'invalid-payload' }`.
- [x] When the bridge is reconnecting, ha-native frames enqueue on the existing bounded reconnect queue (same queue PRD-237's fire_event sinks use) and drain on the next handshake.
- [x] Unit tests cover: schema validation, default service for `ha.notify.send`, event-fire mapping, reconnect-queue path.
- [x] Integration test: bridge router e2e — publish to `/_sinks/ha.notify.send` and assert the bridge dispatches the expected `call_service` frame.

> Naming note: PRD-229's original draft used `ha.notify` (two segments). The federation-wide `SINK_EVENT_TYPE` regex (ADR-034 / PRD-236) requires three segments `<source>.<entity>.<action>`, so the shipped IDs are `ha.notify.send` and `ha.event.fire`. The behaviour matches the PRD intent.

## Notes

- Depends on US-04 — reuses the outbound `call_service` plumbing.
- This story ships the HA-specific shape of the `sinks` dimension. Full generalisation of the dimension (so MQTT and ESPHome bridges can implement it without duplication) is deferred to its own PRD once a second bridge consumes it — explicitly called out as out of scope in the epic.
- The bridge does not own delivery guarantees beyond "WebSocket frame sent". At-least-once / retries / dead-letter is for the calling pillar to handle (or for a future PRD if a generalised sink dispatcher emerges).
- See [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) — `sinks` is the manifest dimension that enables the outbound half of the bridge-pillar pattern.
