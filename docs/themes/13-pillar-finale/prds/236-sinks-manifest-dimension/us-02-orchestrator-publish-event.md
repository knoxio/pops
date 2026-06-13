# US-02: Orchestrator — `publishEvent(eventType, payload)`

> PRD: [Sinks as a first-class manifest dimension](README.md)

## Description

As a source pillar, I want to publish a typed event and have the orchestrator route it to every pillar that has declared a sink for it, so that I do not need to track subscribers, manage retries against each one, or know the network shape between us.

## Acceptance Criteria

- [x] `publishEvent({ eventType, payload, discovery, schemas, poster })` is exported from `@pops/pillar-sdk/orchestrator`.
- [x] Discovery accepts either a snapshot array or an async fetcher (mirrors `runFederatedSearch`).
- [x] The dispatcher enumerates `pillars` from discovery, skips `registered=false`, and matches any pillar whose `manifest.sinks?.descriptors` contains a descriptor with `eventType` equal to the published one.
- [x] Before fan-out, payload is validated against `schemas.get(eventType)` (a runtime Zod registry).
- [x] Missing-from-registry: returns `schema-missing` failure for every matched target; nothing is posted.
- [x] Invalid payload: returns `invalid-payload` failure (with structured Zod issues) for every matched target; nothing is posted.
- [x] Valid payload: HTTP POST is dispatched to every matched target via the injected `poster` (one rejection = `pillar-offline`; other targets still complete).
- [x] Zero subscribers: `{ delivered: [], failures: [] }` no-op.
- [x] The dispatcher never throws — all failure modes are reported in `failures`.
- [x] JSDoc documents the at-least-once delivery contract.
- [x] Tests cover happy-path multi-target dispatch, schema-missing, invalid payload, partial pillar-offline, zero subscribers, `registered=false` skip, and async-fetcher discovery.

## Notes

The orchestrator is pure: no global state, no fetch, no module-level singletons. The HTTP `poster` is injected so tests can use `vi.fn()` and production callers wrap the existing server SDK's authenticated transport.

This US deliberately separates discovery enumeration, payload validation, and HTTP fan-out into helper functions so the main `publishEvent` body stays under the lint threshold and each concern is independently swappable.
