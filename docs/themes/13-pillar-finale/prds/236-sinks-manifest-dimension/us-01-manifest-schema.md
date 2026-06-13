# US-01: Manifest schema — `sinks` dimension

> PRD: [Sinks as a first-class manifest dimension](README.md)

## Description

As a pillar author, I want to declare the cross-pillar events my pillar subscribes to in the manifest so that the orchestrator can route those events to me without me having to register imperatively against every source pillar.

## Acceptance Criteria

- [x] `ManifestPayloadSchema` exposes an optional top-level `sinks` block: `{ descriptors: SinkDescriptor[] }`.
- [x] `SinkDescriptor = { eventType, description, schema }` is a strict Zod object — unknown fields are rejected.
- [x] `eventType` is validated against `<source>.<entity>.<action>` (lowercase dotted, three segments, each `[a-z][a-z0-9]*`).
- [x] `description` is 10-500 chars, matching the AI-tool description convention.
- [x] `schema` is a `Record<string, unknown>` (JSON-Schema-shaped payload contract; runtime Zod schemas are wired in-process).
- [x] Manifests that omit `sinks` entirely still parse (backwards-compatible).
- [x] Manifests with `sinks: { descriptors: [] }` still parse (empty array is valid).
- [x] `SinkDescriptor` is re-exported from `@pops/pillar-sdk/manifest-schema`.
- [x] Schema tests cover: omitted block, empty array, valid descriptor, malformed event types, unknown-field rejection, description length bounds.

## Notes

`schema` carries a JSON-Schema-shaped object instead of a live Zod instance because the manifest is serialised and shared cross-language ([PRD-231](../231-cross-language-wire-format-spec/README.md)). The runtime Zod schema is registered in-process at boot and looked up by `eventType` at dispatch time (see US-02).

The event-type regex is intentionally stricter than the procedure-path regex (no camelCase segments) to keep the publish/subscribe namespace flat and grep-friendly across languages.
