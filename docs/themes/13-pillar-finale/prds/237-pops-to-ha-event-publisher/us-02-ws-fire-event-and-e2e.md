# US-02: `sendFireEvent` + reconnect queue + end-to-end mapping test

> PRD: [pops → HA outbound event publisher](README.md)

## Description

As the HA bridge pillar, I want a `sendFireEvent(haEventName, eventData)` helper on the WebSocket client that delivers HA `fire_event` frames with reconnect-aware queueing, plus an end-to-end test that wires an in-process orchestrator + a stub HA WebSocket and proves one POPS event becomes one HA event over the full path.

## Acceptance Criteria

- [ ] `sendFireEvent(haEventName: string, eventData: Record<string, unknown>): Promise<void>` is implemented on the HA bridge's WebSocket-client module (the same module that owns the PRD-229 US-01 inbound subscriber + reconnect loop).
- [ ] When the WebSocket is `connected`, `sendFireEvent` writes the HA WS protocol's `fire_event` frame and resolves once the frame is on the wire.
- [ ] When the WebSocket is `reconnecting`, `sendFireEvent` enqueues onto a bounded in-memory queue (cap configurable via `HA_SINK_QUEUE_CAP`, default 100) and resolves immediately.
- [ ] When the queue is at cap, the oldest enqueued message is dropped, a structured warning is logged with `{ eventType, queueDepth, droppedAt }`, and an ops metric `ha_sink_dropped_total{event_type}` increments.
- [ ] On reconnect, the queue flushes in FIFO order before any new `sendFireEvent` is accepted onto the live socket.
- [ ] An end-to-end test in `apps/pops-ha-bridge-api/src/sinks/__tests__/e2e.test.ts` constructs an in-process registry with the HA bridge manifest, calls the orchestrator's `publishEvent('media.watch.completed', samplePayload)`, and asserts the stub HA WS receives exactly one `fire_event` frame whose `event_type === 'pops_media_watch_completed'` and whose `event_data` deep-equals the (transformed) payload.
- [ ] The same E2E test covers the reconnect-queue path: the WebSocket is forced into `reconnecting`, `publishEvent` is called, the stub HA WS receives nothing yet; after reconnect, the stub receives the queued frame.
- [ ] The E2E test asserts that a payload failing the mapping's Zod schema is rejected with `400` at the bridge boundary and recorded as `pillar-offline` in the dispatcher result — no HA frame is sent.

## Notes

- Reference [PRD-229 US-01](../229-ha-bridge-pillar/us-01-ws-subscriber-mirror.md) for the WebSocket client shape — `sendFireEvent` lives in the same module and shares the reconnect state machine. Do not stand up a second WS client.
- Reference [PRD-236 US-02](../236-sinks-manifest-dimension/us-02-orchestrator-publish-event.md) for the dispatcher contract — the E2E test uses the real `publishEvent` against the real orchestrator with an injected HTTP poster pointed at the bridge's Express/Fastify/Hono test harness.
- The stub HA WebSocket is a `ws` server in-process; the bridge connects to it on a random port. No external HA dependency in tests. A real HA instance (`ssh capivara`, topology in `../homelab-infra`) is available for manual smoke-testing post-merge but is not part of CI.
- The queue cap of 100 is a heuristic — small enough to fail loud under sustained HA outage, large enough to ride out a 30-second reconnect with a high-frequency sensor's worth of events. Tune later; document in the env var's JSDoc.
- The metric increments should reuse whatever Prometheus / OpenTelemetry plumbing the bridge already uses for inbound stats. If none exists, a `console.warn` structured line is acceptable for this PRD and a follow-up tracks proper metrics.
- The E2E test is the linchpin acceptance criterion for the whole PRD — if it passes, the bidirectional bridge model is proven.
