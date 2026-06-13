# US-05: `sinks` manifest dimension for outbound events

> PRD: [HA bridge pillar](README.md)

## Description

As another POPS pillar (e.g. `pops-cerebrum-api` emitting a notification, or `pops-finance-api` raising a "low balance" event), I want to publish that event to a named sink (`ha.notify`, `ha.event.fire`) and have the HA bridge forward it to HA so that POPS-originated signals reach the user through HA's existing notification surfaces (mobile app, persistent_notification, automations).

## Acceptance Criteria

- [ ] The pillar's manifest declares a new `sinks` dimension: `[ { id: 'ha.notify', accepts: { schema: <zod> } }, { id: 'ha.event.fire', accepts: { schema: <zod> } } ]`.
- [ ] The central registry exposes the `sinks` dimension to discovery clients (additive to existing dimensions).
- [ ] `ha.notify` schema: `{ service?: string; message: string; title?: string; target?: string | string[]; data?: Record<string, unknown> }`. Default service: `notify.notify`. The bridge translates to `call_service` with the supplied target.
- [ ] `ha.event.fire` schema: `{ eventType: string; eventData?: Record<string, unknown> }`. The bridge translates to a `fire_event` WebSocket frame.
- [ ] A sink invocation returns `{ kind: 'ok' } | { kind: 'rejected'; reason: 'pillar-unavailable' | 'ha-offline' | 'invalid-payload' }` — same shape as US-04's `callService`.
- [ ] Sink invocations are validated against the published Zod schema before they hit HA. Invalid payload → `{ kind: 'rejected', reason: 'invalid-payload' }`.
- [ ] When the bridge is in degraded mode, all sinks return `{ kind: 'rejected', reason: 'ha-offline' }` immediately.
- [ ] Unit tests cover: schema validation, default service for `ha.notify`, event-fire mapping, degraded mode.
- [ ] Integration test: stand up a stub upstream pillar that publishes to `ha.notify`, assert the bridge dispatches the expected `call_service` frame.

## Notes

- Depends on US-04 — reuses the outbound `call_service` plumbing.
- This story ships the HA-specific shape of the `sinks` dimension. Full generalisation of the dimension (so MQTT and ESPHome bridges can implement it without duplication) is deferred to its own PRD once a second bridge consumes it — explicitly called out as out of scope in the epic.
- The bridge does not own delivery guarantees beyond "WebSocket frame sent". At-least-once / retries / dead-letter is for the calling pillar to handle (or for a future PRD if a generalised sink dispatcher emerges).
- See [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) — `sinks` is the manifest dimension that enables the outbound half of the bridge-pillar pattern.
