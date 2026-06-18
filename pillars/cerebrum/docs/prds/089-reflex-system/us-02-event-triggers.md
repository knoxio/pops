# US-02: Event Triggers

> PRD: [PRD-089: Reflex System](README.md)
> Status: Done

## Description

As the Cerebrum system, I need event-based triggers that fire reflexes on engram lifecycle events so that automated actions can respond to changes in the knowledge base in near real-time.

## Acceptance Criteria

- [x] An event bus built on BullMQ publishes engram lifecycle events: `engram.created`, `engram.modified`, `engram.archived`, `engram.linked` — each event carries a payload with the engram ID, type, scopes, source, and the change details
- [x] Event-triggered reflexes subscribe to their configured event type on load — when an event matches a reflex's trigger, the reflex's action is dispatched
- [x] The optional `conditions` object on event triggers filters events by engram fields: `type` (exact match), `scopes` (prefix match — `work.*` matches any scope starting with `work.`), `source` (exact match) — only events matching all conditions trigger the reflex
- [x] Template variables in action payloads are resolved from the event payload: `{{engram_id}}` resolves to the affected engram's ID, `{{engram_type}}` to its type, `{{engram_scopes}}` to a comma-separated list of scopes
- [x] Event dispatching is asynchronous — the event emitter (engram CRUD service) enqueues events to BullMQ and does not wait for reflex execution. Reflex actions run in their own job context
- [x] Each reflex execution creates a `reflex_executions` row with `trigger_type: 'event'`, the event payload in `trigger_data`, and the action outcome in `result`
- [x] Multiple reflexes can fire on the same event — each executes independently with no ordering guarantees. One failing reflex does not block others
- [x] Event triggers are re-subscribed when `reflexes.toml` is reloaded — stale subscriptions from removed or disabled reflexes are cleaned up

## Notes

- The event bus reuses the existing BullMQ infrastructure — events are published as jobs on a `pops:cerebrum-events` queue. Reflex subscribers are BullMQ workers that filter by event type.
- Engram lifecycle events should be emitted by the engram CRUD service (PRD-077 US-05) and the Glia workers (PRD-085). The Reflex system is a consumer of these events, not the producer.
- Event debouncing is not handled at the reflex level — if Thalamus already debounces file events (PRD-079), the engram CRUD events should be emitted after debounce, not before.
- Consider a dead-letter queue for failed reflex executions — failed actions should not be silently lost.
