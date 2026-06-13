# US-01: Author the wire-format spec document

> PRD: [Cross-language SDK wire-format spec](README.md)

## Description

As a Rust, Go, or Python engineer wanting to ship a POPS-compatible pillar in my language of choice, I want a single normative document describing the HTTP wire format precisely so that I can implement a compliant pillar without reading the TypeScript SDK source.

## Acceptance Criteria

- [ ] `wire-format-spec.md` exists at the publication target chosen by US-02 and reads end-to-end on a single page (no transcluded sections, no chained references to other docs to understand the protocol).
- [ ] Document carries a `Version: 1` header and a `Status: Stable` marker.
- [ ] Single-call procedure section specifies the exact URL pattern (`POST /trpc/<router>.<procedure>`), the body shape (`{ "input": <T> }`), the success response (`{ "result": { "data": <T> } }`), and the error response (`{ "error": { "code", "message", "data" } }`) with worked examples.
- [ ] Batched-procedure section specifies the URL pattern with comma-separated procedures, the body shape `{"0": ..., "1": ...}`, the response array shape, and the position-preserving rule.
- [ ] Subscription section specifies the URL pattern, `Accept: text/event-stream`, the `data: <json>\n\n` event format, the heartbeat convention, the mid-stream error event, and the reconnect semantics.
- [ ] Manifest endpoint section specifies `GET /manifest.json`, the required and optional fields, references `ManifestPayloadSchema` from PRD-157, and the no-store caching rule.
- [ ] Registration handshake section specifies `POST <core>/trpc/core.registry.register`, the `X-Internal-API-Key` header, the body shape, the retry/backoff policy, and idempotency.
- [ ] Health endpoint section specifies `GET /health`, the readiness vs. liveness distinction, and the `503` failure shape.
- [ ] Error code section enumerates every valid `code` value (tRPC v11 codes + `PILLAR_UNAVAILABLE`) with one sentence on when each is emitted and how a compliant client should react.
- [ ] Versioning section defines `X-Pops-Wire-Version`, the v1 floor rule, and the deprecation window policy for future versions.
- [ ] Document explicitly disclaims OpenAPI's role and references [ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md): OpenAPI is the schema-level contract; this spec is the wire-level contract.
- [ ] At least one worked example per shape (single-call, batched, subscription, manifest, registration, health) with real JSON, not pseudocode.
- [ ] A "Compliance" section pointing at the PRD-231 conformance suite (US-03) as the binary green/red check.

## Notes

This document is normative for cross-language interop and will be referenced by ADRs and future PRDs. Write it precisely. The audience reads it once before writing code; ambiguity becomes a bug in someone else's runtime.

Resist the temptation to include implementation guidance (e.g. "here's how to do this in Rust with `axum`"). Specify the bytes on the wire, full stop. The wire-format spec is language-agnostic by definition.

When in doubt about a behaviour the TS SDK exhibits, treat the TS SDK as one implementation among many — describe what bytes a _compliant_ implementation produces, not what `@pops/pillar-sdk` happens to produce. If the SDK diverges from the spec, the SDK is the bug.
