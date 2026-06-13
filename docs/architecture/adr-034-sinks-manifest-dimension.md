# ADR-034: Sinks as a First-Class Manifest Dimension

## Status

Accepted — 2026-06-13

## Context

The pillar manifest currently declares three dimensions of how a pillar participates in cross-cutting orchestration:

1. **`searchAdapters`** — this pillar can answer search queries about entities it owns (PRD-196 / PRD-197 / PRD-198)
2. **`aiTools`** — this pillar exposes typed functions the LLM orchestrator can call (PRD-200 / PRD-201 / PRD-202)
3. **`subscriptions`** (implicit via the registry) — this pillar reports its health and metadata to the registry; consumers subscribe to registry events

All three are about data and call flow _into_ the pillar — search queries come in, AI tool calls come in, registry queries come in. The pillar's job is to respond.

[ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) introduces bridge pillars as the integration pattern. The HA bridge pillar (PRD-229) needs to receive Home Assistant entity state changes _and also_ forward outbound events from POPS to HA (e.g. when finance detects a low balance, HA fires a notification automation). MQTT bridges, ESPHome bridges, and a future "webhooks" bridge all share the same shape: they bidirectionally translate between POPS's internal event space and an external system.

The existing manifest dimensions cannot express "this pillar accepts events of shape X from other pillars and forwards them somewhere." There is no schema for declaring an outbound event sink, no routing layer to dispatch a published event to the right sink, and no contract for the receiving pillar to validate the event shape.

## Options Considered

| Option                                                                                                              | Pros                                                                                                                                  | Cons                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status quo — bridges call `pillar('source').something.subscribe(...)` directly**                                  | No new manifest surface                                                                                                               | Every bridge has to hand-roll subscription to every source pillar's event stream; no validation; pillars don't know who's consuming their events; tight coupling   |
| **Webhooks pattern — each pillar exposes `POST /webhooks` and bridges register URLs**                               | Simple HTTP shape; easy to debug                                                                                                      | Reinvents a worse version of message routing; requires every source pillar to track subscriber list; no schema validation; bypasses the SDK type-safety story    |
| **First-class `sinks` manifest dimension (chosen)**                                                                 | Symmetric with `searchAdapters` / `aiTools`; the orchestrator handles routing; sinks declare their accepted event shape via Zod schemas; type-safe outbound flow | Adds a new manifest dimension to validate, lint, codegen; needs router/dispatcher work in the SDK orchestrator (PRD-236, Wave 7)                                  |
| **Use HA's event bus as the canonical event substrate (require HA installed for outbound flow)**                    | Reuses a battle-tested event system                                                                                                   | Forces HA dependency for any pillar that wants to publish events; defeats the additive-not-required-dependency stance of ADR-032; circular if HA bridge wants to use it for non-HA flow |

## Decision

Add `sinks` as a first-class manifest dimension alongside `searchAdapters` and `aiTools`. Each sink declares:

- **`eventType`**: a stable string identifier (e.g. `'finance.balance.low'`, `'media.watch.completed'`)
- **`schema`**: a Zod schema for the event payload
- **`description`**: human-readable doc for the sink's purpose

The orchestrator (existing federated-query orchestrator in `@pops/pillar-sdk/src/orchestrator/`) gains a parallel sub-system: a publish-subscribe router that, when a pillar calls `publishEvent(eventType, payload)`, looks up every pillar manifesting a sink for that eventType, validates the payload against each sink's schema, and HTTP-POSTs to each `/_sinks/<eventType>` endpoint.

Source pillars do not need to know which sinks are subscribed. They publish; the orchestrator routes. New sinks come and go (bridge pillars register/deregister at runtime per PRD-228) without source pillars knowing.

For the HA bridge pillar (PRD-229), the sinks dimension is what enables outbound flow: HA bridge declares a sink for `'media.watch.completed'`, gets called when media publishes the event, translates to an HA `event.fire` over WebSocket.

The full implementation is split across Wave 7 PRDs:

- **PRD-236**: scaffold the `sinks` manifest field, validator, orchestrator router, `publishEvent()` SDK method, `/_sinks/<eventType>` endpoint convention
- **PRD-237**: pops → HA event publisher uses sinks as its first consumer (proves the loop)

## Consequences

- **Enables:** bidirectional bridge pillars (PRD-229 HA, PRD-234 MQTT, PRD-235 ESPHome) where outbound flow is symmetric with inbound flow
- **Enables:** decoupled event publishing — source pillars don't need a subscriber list; new sinks plug in without source changes
- **Enables:** typed event payloads via Zod, matching the rest of the platform's typing stance
- **Prevents:** the temptation to use a side-channel (webhooks, MQTT) for cross-pillar event flow; sinks become the canonical answer
- **Constrains:** the manifest grows another dimension. The validator, the codegen, the docs all need to learn about sinks. Real but manageable cost.
- **Constrains:** event-type identifiers become a flat namespace. Naming discipline (`<source>.<entity>.<action>`) needs documenting. Likely a PRD-236 sub-section.
- **Trade-off accepted:** the dispatcher is at-least-once delivery, not exactly-once. Sinks must be idempotent. Documented as a contract.
- **Trade-off accepted:** the sinks dimension does not replace HA's event bus for HA-internal events. It is for cross-POPS-pillar flow that bridges can subscribe to.

## Related

- [ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) — establishes the bridge-pillar pattern that needs the sinks dimension
- PRD-196 / PRD-197 / PRD-198 — searchAdapters dimension (the precedent for first-class manifest features)
- PRD-200 / PRD-201 / PRD-202 — aiTools dimension (the second precedent)
- PRD-229 — HA bridge pillar (first inbound bridge, also first outbound consumer of sinks)
- PRD-236 — sinks manifest dimension scaffold (Wave 7, planned)
- PRD-237 — pops → HA event publisher (Wave 7, planned)
