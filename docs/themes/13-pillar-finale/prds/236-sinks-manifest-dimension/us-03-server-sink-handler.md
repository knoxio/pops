# US-03: Server — `/_sinks/<eventType>` handler helper

> PRD: [Sinks as a first-class manifest dimension](README.md)

## Description

As a subscriber pillar, I want a framework-agnostic helper that validates an inbound sink payload against my declared Zod schema and runs my handler, so that I do not have to hand-roll request parsing, validation, and error mapping for every event type I subscribe to.

## Acceptance Criteria

- [x] `createSinkHandler({ eventType, schema, handler })` is exported from `@pops/pillar-sdk/server`.
- [x] The returned object exposes `path = '/_sinks/<eventType>'`, `eventType`, `schema`, and `invoke(payload: unknown) → Promise<SinkInvocationResult>`.
- [x] `invoke` Zod-validates the payload; on failure returns `{ status: 'invalid-payload', issues }` (for the HTTP layer to map to 400).
- [x] `invoke` awaits the user handler on success; returns `{ status: 'ok' }`.
- [x] Handler exceptions (sync throw or rejected promise) are caught and returned as `{ status: 'handler-failed', error }` (for the HTTP layer to map to 500 so the dispatcher retries).
- [x] The helper does not depend on Express, Fastify, or any specific framework — the consuming pillar wires `path` to its router and calls `invoke(req.body)`.
- [x] JSDoc documents the at-least-once delivery contract and that handlers MUST be idempotent.
- [x] Tests cover: path construction, valid payload → `ok`, invalid payload → `invalid-payload` with issues, handler throw → `handler-failed`, async handler awaited before returning.

## Notes

The helper is framework-agnostic by design to match the rest of `@pops/pillar-sdk/server` — the SDK does not bind to a single HTTP stack. Pillars wire the returned `path` + `invoke` into their existing router.

`handler-failed` is distinct from `invalid-payload` so the HTTP layer can return 500 (server-side bug, dispatcher should retry) versus 400 (publisher's payload is wrong, dispatcher should not retry). Without this split, the at-least-once guarantee can mask publisher bugs as transient errors.
