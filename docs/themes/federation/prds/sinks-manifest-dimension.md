# Sinks as a first-class manifest dimension

> Theme: [Federation](../README.md) · Area: Manifest dimensions · Related idea: [Bridge pillars](../../../ideas/bridge-pillars.md)
> ADR: [ADR-034](../../../architecture/adr-034-sinks-manifest-dimension.md)
> Status: Partial — schema + dispatcher + handler helper shipped; cross-field uniqueness validator and any production publisher/subscriber are deferred (see [idea](../../../ideas/sinks-manifest-dimension.md))

## Overview

`sinks` is a manifest dimension alongside `search`, `ai`, and `uri`. A sink is a typed declaration that a pillar will receive a named event type from any other pillar in the federation — the inverse of every other dimension, which all describe inbound query/tool traffic the pillar serves.

This delivers the cross-pillar event scaffold: the manifest schema field, the orchestrator dispatcher (`publishEvent`), the `/_sinks/<eventType>` HTTP endpoint convention, and the framework-agnostic server handler helper (`createSinkHandler`). A source pillar publishes a typed event; the orchestrator routes it to every registered pillar whose manifest declares a matching sink — the publisher never tracks subscribers.

No bus, no broker. Cross-pillar event flow is in-process orchestrator enumeration over the live registry snapshot plus direct HTTP POST, inside the docker-network trust boundary ([ADR-026](../../../architecture/adr-026-pillar-architecture.md)).

## Data Model

No database surface. The artifacts are a manifest schema extension, an orchestrator dispatch function, an HTTP endpoint convention, and a Zod-validated server handler helper.

### Manifest schema extension

`@pops/pillar-sdk/manifest-schema` carries an optional top-level `sinks` block:

```ts
sinks?: {
  descriptors: SinkDescriptor[];
};

type SinkDescriptor = {
  eventType: string;                // <source>.<entity>.<action>
  description: string;              // 10-500 chars
  schema: Record<string, unknown>;  // JSON-Schema-shaped payload contract
};
```

`schema` carries a JSON-Schema-shaped object (cross-language-friendly per the [wire format spec](cross-language-wire-format-spec.md)), not a live Zod instance — the manifest is serialised and shared across languages. The runtime Zod schema is held in-process and indexed by `eventType` for orchestrator-side validation at dispatch time.

`SinkDescriptor`, `descriptors`, and the whole `sinks` block are `.strict()` Zod objects — unknown fields are rejected. The block is optional and backwards-compatible: pillars that consume no cross-pillar events omit it; validators and codegen treat absence as "no sinks declared".

### Event type naming convention

| Segment | Constraint                                 |
| ------- | ------------------------------------------ |
| source  | lowercase `[a-z][a-z0-9]*` (the pillar id) |
| entity  | lowercase `[a-z][a-z0-9]*`                 |
| action  | lowercase `[a-z][a-z0-9]*`                 |

Regex (single source of truth): `^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$`. Examples: `finance.balance.low`, `media.watch.completed`, `inventory.item.added`.

The flat dotted namespace is intentionally stricter than the procedure-path regex (no camelCase segments) so the publish/subscribe namespace stays grep-friendly across languages, and two pillars cannot accidentally pick the same event type with diverging payload shapes. Naming discipline is enforced at manifest-validation time by the strict `ManifestPayloadSchema` parse. See [ADR-036](../../../architecture/adr-036-pillar-id-tool-name-conventions.md) for the full pillar-id / tool-name / sink-event-type convention.

## REST / Dispatch Surface

### `publishEvent(options)` — orchestrator-side

`@pops/pillar-sdk/orchestrator`. Pure: no global state, no module-level fetch. Discovery, the runtime Zod registry, and the HTTP poster are all injected.

| Aspect    | Value                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs    | `{ eventType, payload, discovery, schemas, poster }`                                                                                                                                                                      |
| discovery | A `PillarSnapshot[]` array **or** an async `() => Promise<PillarSnapshot[]>` fetcher (mirrors `runFederatedSearch`)                                                                                                       |
| schemas   | `ReadonlyMap<string, z.ZodType<unknown>>` — runtime Zod registry keyed by `eventType`                                                                                                                                     |
| poster    | `(target: { pillarId, baseUrl, eventType, payload }) => Promise<void>` — production wraps the authenticated server transport; tests inject a `vi.fn()`                                                                    |
| Behavior  | Enumerate pillars → skip `registered=false` → match any whose `manifest.sinks?.descriptors` contains `eventType` → validate payload against `schemas.get(eventType)` → POST to `${baseUrl}/_sinks/${eventType}` per match |
| Result    | `{ delivered: { pillarId, eventType }[], failures: SinkDispatchFailure[] }`. Never throws. Zero subscribers is a no-op (`{ delivered: [], failures: [] }`).                                                               |

`SinkDispatchFailure` reasons:

| reason            | When                                                                 | Posted?   |
| ----------------- | -------------------------------------------------------------------- | --------- |
| `schema-missing`  | `schemas.get(eventType)` is undefined — boot-time wiring error       | No        |
| `invalid-payload` | Payload fails Zod validation (carries structured `issues`)           | No        |
| `pillar-offline`  | The HTTP POST rejected (network failure or non-2xx; carries `error`) | Attempted |

`schema-missing` and `invalid-payload` fan out one failure record per matched target and post nothing. `pillar-offline` is per-target via `Promise.allSettled` — one offline subscriber never blocks the rest of the federation.

### `POST /_sinks/<eventType>` — receiving side

| Aspect  | Value                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------- |
| URL     | `POST <base_url>/_sinks/<eventType>`                                                                      |
| Body    | JSON payload matching the manifest's declared `schema` for `eventType`                                    |
| Success | `200` after the user handler completes                                                                    |
| `400`   | Invalid payload (Zod-validated server-side too) — the publisher is wrong; the dispatcher should not retry |
| `500`   | Handler threw — the dispatcher should retry                                                               |

`createSinkHandler({ eventType, schema, handler })` (`@pops/pillar-sdk/server`) returns `{ path: '/_sinks/<eventType>', eventType, schema, invoke(payload) }`. The pillar's HTTP framework (Express, Fastify, Hono, plain node:http) wires `path` to a route and calls `invoke(req.body)`. The SDK does not bind to any one framework.

`invoke` returns a `SinkInvocationResult` the HTTP layer maps to status codes:

| result            | → HTTP | Meaning                                                      |
| ----------------- | ------ | ------------------------------------------------------------ |
| `ok`              | 200    | Handler awaited and resolved                                 |
| `invalid-payload` | 400    | Zod validation failed (carries `issues`)                     |
| `handler-failed`  | 500    | Handler threw sync or its promise rejected (carries `error`) |

The `invalid-payload` / `handler-failed` split is load-bearing: without it, the at-least-once guarantee masks a publisher's bad payload (which should not be retried) as a transient server error (which should).

## Rules

- **At-least-once delivery.** The dispatcher (or its caller's retry loop) may invoke the same handler with the same payload more than once — network retry, replay, partial dispatch failure. Handlers MUST be idempotent and dedupe mutations on a stable payload field. Pinned in the JSDoc of both `publishEvent` and `createSinkHandler` and in the [ADR-034](../../../architecture/adr-034-sinks-manifest-dimension.md) trade-off section.
- **Source pillars do not know who subscribes.** Publishers call `publishEvent` with no subscriber list. Routing is driven entirely by the live registry snapshot. A new sink plugs in by registering its manifest — no source-pillar change.
- **The manifest `schema` is the payload contract.** A payload that fails Zod validation against a declared sink is the publisher's bug. The dispatcher refuses to fan out an invalid payload.
- **A declared sink must have a matching runtime Zod schema.** If `schemas.get(eventType)` is undefined at dispatch, every matched target gets `schema-missing` and nothing is posted — a boot-time wiring error, not a runtime one.
- **A pillar's offline state never blocks the federation.** `pillar-offline` is reported per target; other subscribers still receive the event. Matches the federated-search partial-failure stance.
- **Event-type naming is normative.** The Zod regex on `eventType` is the single source of truth. A PR introducing a new event must follow `<source>.<entity>.<action>` or fail the manifest validator.
- **`sinks` is optional and backwards-compatible.** Absence means "no sinks declared".

## Edge Cases

| Case                                                                      | Behaviour                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two pillars declare sinks for the same `eventType` with diverging schemas | Dispatcher validates once against the publisher-side registry's schema, then posts the validated payload to both. Drift is a deployment bug surfaced by integration testing — not the dispatcher's job to police. |
| Publisher payload fails Zod validation                                    | Every matched target gets `invalid-payload`; no POST issued. Caller logs or surfaces a 4xx on its own API.                                                                                                        |
| Subscriber HTTP returns 4xx/5xx or rejects                                | Any rejection is `pillar-offline`. The dispatcher does not interpret the response body; it does not retry. At-least-once is the caller's retry loop.                                                              |
| Zero subscribers for an `eventType`                                       | `{ delivered: [], failures: [] }`. Publisher proceeds — a future bridge may register later.                                                                                                                       |
| Subscriber is in the registry but `registered=false` (reconcile window)   | Skipped. Reconciliation re-registers it; the next publish picks it up.                                                                                                                                            |
| Handler throws synchronously / returns a rejecting promise                | `handler-failed` → HTTP 500. The dispatcher re-classifies as `pillar-offline` on retry.                                                                                                                           |
| Manifest declares a sink for an `eventType` no pillar ever publishes      | Inert. Zero overhead; no validation, no dispatch.                                                                                                                                                                 |
| Publisher caches a stale discovery snapshot                               | The snapshot refreshes within the registry TTL window. A brand-new sink may miss the first few events — documented limitation.                                                                                    |

## Acceptance Criteria

### Manifest schema — `sinks` dimension

- [x] `ManifestPayloadSchema` carries an optional top-level `sinks` block: `{ descriptors: SinkDescriptor[] }`.
- [x] `SinkDescriptor = { eventType, description, schema }` is a strict Zod object — unknown fields rejected.
- [x] `eventType` is validated against `<source>.<entity>.<action>` (lowercase dotted, three segments, each `[a-z][a-z0-9]*`).
- [x] `description` is 10-500 chars.
- [x] `schema` is a `Record<string, unknown>` (JSON-Schema-shaped; runtime Zod wired in-process).
- [x] Manifests that omit `sinks` still parse (backwards-compatible).
- [x] Manifests with `sinks: { descriptors: [] }` still parse.
- [x] `SinkDescriptor` is re-exported from `@pops/pillar-sdk/manifest-schema`.
- [x] Schema tests cover omitted block, empty array, valid descriptor, malformed event types, unknown-field rejection, description length bounds.

### Orchestrator — `publishEvent(eventType, payload)`

- [x] `publishEvent({ eventType, payload, discovery, schemas, poster })` is exported from `@pops/pillar-sdk/orchestrator`.
- [x] `discovery` accepts either a snapshot array or an async fetcher.
- [x] Enumerates pillars, skips `registered=false`, matches any whose `manifest.sinks?.descriptors` contains the `eventType`.
- [x] Validates payload against `schemas.get(eventType)` before fan-out.
- [x] Missing schema → `schema-missing` for every matched target; nothing posted.
- [x] Invalid payload → `invalid-payload` (with structured Zod issues) for every matched target; nothing posted.
- [x] Valid payload → POST to every matched target via the injected `poster`; one rejection = `pillar-offline`, others still complete.
- [x] Zero subscribers → `{ delivered: [], failures: [] }`.
- [x] The dispatcher never throws — all failure modes are reported in `failures`.
- [x] JSDoc documents the at-least-once delivery contract.
- [x] Tests cover happy-path multi-target, schema-missing, invalid payload, partial pillar-offline, zero subscribers, `registered=false` skip, async-fetcher discovery.

### Server — `/_sinks/<eventType>` handler helper

- [x] `createSinkHandler({ eventType, schema, handler })` is exported from `@pops/pillar-sdk/server`.
- [x] Returns `{ path: '/_sinks/<eventType>', eventType, schema, invoke(payload) }`.
- [x] `invoke` Zod-validates; on failure returns `{ status: 'invalid-payload', issues }`.
- [x] `invoke` awaits the user handler on success; returns `{ status: 'ok' }`.
- [x] Handler exceptions (sync throw or rejected promise) return `{ status: 'handler-failed', error }`.
- [x] Framework-agnostic — no Express/Fastify/Hono dependency.
- [x] JSDoc documents the at-least-once contract and that handlers MUST be idempotent.
- [x] Tests cover path construction, valid → `ok`, invalid → `invalid-payload` with issues, handler throw → `handler-failed`, async handler awaited.

## Out of Scope

- Cross-field manifest validation of sink uniqueness (`checkSinkEventTypesAreUnique`) — deferred, see [idea](../../../ideas/sinks-manifest-dimension.md).
- Any production publisher or subscriber wiring — the dispatcher and handler helper exist in the SDK but no pillar mounts a sink or calls `publishEvent` yet. The first consumers are the [HA bridge pillar](../../../ideas/ha-bridge-pillar.md) and the [pops → HA event publisher](../../../ideas/pops-to-ha-event-publisher.md).
- Per-event retry policy. The dispatcher reports failures; retry is the caller's concern (or a future durable-queue layer).
- Exactly-once delivery. ADR-034 pins at-least-once; sinks must be idempotent.
- A wire-side binary protocol or Protobuf payloads. Sink payloads are JSON over HTTP, matching the [wire format](cross-language-wire-format-spec.md).
- Per-sink auth beyond the shared service-account `X-API-Key`. Sinks live inside the docker-network trust boundary ([ADR-026](../../../architecture/adr-026-pillar-architecture.md)).
- A bus / broker (NATS, Kafka, MQTT). Cross-pillar flow stays in-process orchestrator + direct HTTP.
- Subscription filtering by payload content. Sinks subscribe by `eventType` only; payload-level filtering happens in the handler.
- Long-running / streaming sink handlers. Handlers are short async functions; streaming uses SSE on the inbound side.
