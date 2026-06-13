# PRD-236: Sinks as a first-class manifest dimension

> Epic: [Bridge pillars](../../epics/13-bridge-pillars.md)

> Status: In progress — US-01 done, US-02 done, US-03 done; US-04 (cross-field validation) pending

> ADR: [ADR-034](../../../../architecture/adr-034-sinks-manifest-dimension.md)

## Overview

[ADR-034](../../../../architecture/adr-034-sinks-manifest-dimension.md) introduces `sinks` as a first-class manifest dimension alongside `searchAdapters` and `aiTools`. A sink is a typed declaration that a pillar will receive a named event type from any other pillar in the federation — the inverse of every existing dimension, which all describe inbound traffic.

This PRD ships the scaffold: the manifest schema field, the orchestrator dispatcher, the `/_sinks/<eventType>` HTTP endpoint convention, and the `publishEvent(eventType, payload)` SDK method. With this in place, [PRD-229](../229-ha-bridge-pillar/README.md) (HA bridge) can declare its outbound sinks and [PRD-237](../237-pops-to-ha-event-publisher) (future) wires the first real publisher.

## Data Model

This PRD has no database surface. The artifacts are a manifest schema extension, an orchestrator sub-system, an HTTP endpoint convention, and a Zod-validated handler helper.

### Manifest schema extension

`@pops/pillar-sdk/manifest-schema` gains an optional top-level `sinks` field:

```ts
sinks?: {
  descriptors: SinkDescriptor[];
};

type SinkDescriptor = {
  eventType: string;           // <source>.<entity>.<action>
  description: string;         // 10-500 chars
  schema: Record<string, unknown>; // JSON-Schema-shaped payload contract
};
```

`schema` carries a JSON-Schema-shaped object (cross-language-friendly per [PRD-231](../231-cross-language-wire-format-spec/README.md) direction), not a live Zod instance. The runtime Zod schema is registered in-process at boot time and indexed by `eventType` for orchestrator-side validation.

### Event type naming convention

| Segment | Constraint                                 |
| ------- | ------------------------------------------ |
| source  | lowercase `[a-z][a-z0-9]*` (the pillar id) |
| entity  | lowercase `[a-z][a-z0-9]*`                 |
| action  | lowercase `[a-z][a-z0-9]*`                 |

Examples: `finance.balance.low`, `media.watch.completed`, `inventory.item.added`.

The flat dotted namespace means two pillars cannot accidentally pick the same event type with diverging payload shapes. Naming discipline is enforced at manifest-validation time (rejected via the existing `ManifestPayloadSchema` strict-mode parse).

## API Surface

### `publishEvent(eventType, payload, ...)` — orchestrator-side

| Aspect   | Value                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module   | `@pops/pillar-sdk/orchestrator`                                                                                                                                                                                                                  |
| Inputs   | `eventType`, `payload`, `discovery` (snapshot or fetcher), `schemas` (runtime Zod registry keyed by `eventType`), `poster` (HTTP dispatcher)                                                                                                     |
| Behavior | Enumerate registered pillars whose manifest declares a sink for `eventType` → validate payload against the registry's Zod schema → POST to `${baseUrl}/_sinks/${eventType}` on every match. Zero subscribers is a no-op.                         |
| Failure  | Returns `{ delivered, failures }`. Per-target failures (`schema-missing`, `invalid-payload`, `pillar-offline`) never throw — the dispatcher continues to other targets so a single offline subscriber does not block the rest of the federation. |

### `/_sinks/<eventType>` — receiving side

| Aspect  | Value                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| URL     | `POST <base_url>/_sinks/<eventType>`                                                                                                                                                       |
| Body    | JSON payload matching the manifest's declared `schema` for `eventType`                                                                                                                     |
| Success | `200 OK` after the user-supplied handler completes                                                                                                                                         |
| Errors  | `400` on invalid payload (Zod-validated server-side too); `500` on handler exception so the dispatcher knows to retry                                                                      |
| Helper  | `createSinkHandler({ eventType, schema, handler })` returns `{ path, eventType, schema, invoke(payload) }`. The pillar's HTTP framework (Express, Fastify, Hono) wires `path` to `invoke`. |

## Business Rules

- **At-least-once delivery.** The dispatcher may invoke the same handler with the same payload more than once (network retry, replay, partial dispatch failure). Handlers MUST be idempotent — mutations dedupe on a stable payload field. Documented in the JSDoc of both `publishEvent` and `createSinkHandler`. ADR-034 trade-off section pins this.
- **Source pillars do not know who subscribes.** Publishers call `publishEvent` with no subscriber list. The orchestrator routes based on the live registry snapshot. New sinks plug in by registering with their manifest; no source-pillar change needed.
- **The manifest `schema` is the payload contract.** A publisher whose payload fails Zod validation against any declared sink is the publisher's bug, not the sink's. The dispatcher refuses to fan out an invalid payload.
- **A sink declared in the manifest must have a matching runtime Zod schema.** If `schemas.get(eventType)` is undefined at dispatch time, the dispatcher reports `schema-missing` on every matched target without posting — this is a boot-time wiring error.
- **A pillar's offline state never blocks the federation.** `pillar-offline` failures are reported in the result; other subscribers still receive the event. This matches the search orchestrator's partial-failure stance (PRD-199).
- **Event-type naming is normative.** The Zod regex on `eventType` is the single source of truth. PRs that introduce a new event must follow `<source>.<entity>.<action>` or fail the manifest validator.
- **The `sinks` field is optional and backwards-compatible.** Pillars that do not consume cross-pillar events omit it. Validators and codegen treat absence as "no sinks declared".

## Edge Cases

| Case                                                                               | Behaviour                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two pillars declare sinks for the same `eventType` with mutually exclusive schemas | The dispatcher uses the publisher-side registry's Zod schema for validation, then posts the validated payload to both. Drift between sinks is a deployment bug, surfaced by integration testing — not the dispatcher's job to police. |
| Publisher payload fails Zod validation                                             | All matched targets get `invalid-payload` failure records; no HTTP POST is issued. Caller's responsibility to log or surface as a 4xx on its own API.                                                                                 |
| Subscriber HTTP returns `400`                                                      | Treated as `pillar-offline` (any rejection is offline). The dispatcher does not interpret the response body. Operator follow-up via logs.                                                                                             |
| Subscriber HTTP returns `500`                                                      | Treated as `pillar-offline`. The publisher's retry policy decides whether to re-publish. The dispatcher itself does not retry — at-least-once is provided by the caller's retry loop or upstream queue.                               |
| Zero subscribers for an `eventType`                                                | `{ delivered: [], failures: [] }`. Publisher proceeds — useful when a future bridge may register later.                                                                                                                               |
| Subscriber pillar is in the registry but `registered=false` (PRD-162 reconcile)    | Skipped. Reconciliation will re-register it; the next publish picks it up.                                                                                                                                                            |
| Handler throws synchronously                                                       | Returned as `handler-failed` → mapped to HTTP 500 by the HTTP wrapper. Dispatcher re-classifies as `pillar-offline` if/when this is retried.                                                                                          |
| Handler returns a promise that rejects                                             | Same as synchronous throw — `handler-failed`, HTTP 500.                                                                                                                                                                               |
| Manifest declares a sink for an `eventType` that no pillar ever publishes          | Inert. Zero overhead; no validation, no dispatch.                                                                                                                                                                                     |
| Pillar registers, then the publisher caches the discovery snapshot                 | Per PRD-162 reconcile + the registry TTL, the publisher's snapshot refreshes within the TTL window. Stale-fallback windows mean a brand-new sink may miss the first few events — documented limitation.                               |

## User Stories

| #   | Story                                                                   | Summary                                                                                                                                                                         | Parallelisable           |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 01  | [us-01-manifest-schema](us-01-manifest-schema.md)                       | Extend `ManifestPayloadSchema` with the optional `sinks` block, the `SinkDescriptor` type, the `<source>.<entity>.<action>` event-type regex, and schema tests.                 | yes — foundational       |
| 02  | [us-02-orchestrator-publish-event](us-02-orchestrator-publish-event.md) | Add `publishEvent(eventType, payload, ...)` to the orchestrator. Discovery enumeration, runtime Zod validation, fan-out via an injected HTTP poster, structured failure result. | blocked by us-01         |
| 03  | [us-03-server-sink-handler](us-03-server-sink-handler.md)               | Add `createSinkHandler({ eventType, schema, handler })` to `@pops/pillar-sdk/server`. Framework-agnostic helper that returns the `/_sinks/<eventType>` path + invoker.          | blocked by us-01         |
| 04  | [us-04-cross-field-validation](us-04-cross-field-validation.md)         | Add cross-field manifest validation: every declared `sink.eventType` should round-trip the regex and (when paired with PRD-237) be recognised by the publisher-side registry.   | blocked by us-02 + us-03 |

## Out of Scope

- Per-event retry policy. The dispatcher reports failures; retry is the caller's concern (or a future durable-queue layer). At-least-once is delivered by retry, not by the dispatcher itself.
- Exactly-once delivery. ADR-034 trade-off section pins at-least-once. Sinks must be idempotent.
- A wire-side binary protocol or Protobuf-encoded payloads. Sink payloads are JSON over HTTP, matching the rest of the wire format (PRD-231).
- Per-sink authentication / authorization beyond the existing service-account `X-API-Key` shared key. Sinks live inside the docker network's trust boundary per ADR-027.
- A bus / broker (NATS, Kafka, MQTT). Cross-pillar event flow stays in-process orchestrator + direct HTTP. A future ADR can revisit if scale demands.
- Subscription filtering by payload content. Sinks subscribe by `eventType` only. A bridge that needs payload-level filtering does it in its handler.
- Long-running / streaming sink handlers. Handlers are short, synchronous-async functions that complete quickly. Streaming use cases use SSE on the inbound side, not a sink.
