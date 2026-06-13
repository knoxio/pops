# US-01: Mapping config + manifest derivation + sink-handler wiring

> PRD: [pops → HA outbound event publisher](README.md)

## Description

As the HA bridge pillar, I want a typed mapping config that drives both the manifest `sinks.descriptors` block and the runtime `/_sinks/<eventType>` handler registry, so that adding a new POPS → HA event mapping is a single-file edit with no risk of drift between what the bridge advertises and what it actually accepts.

## Acceptance Criteria

- [ ] A `SinkMapping` type lives at `apps/pops-ha-bridge-api/src/sinks/types.ts` with the fields `eventType`, `description`, `haEventName`, `schema`, and `transformInline` (optional; defaults to identity).
- [ ] A `mappings: SinkMapping[]` array at `apps/pops-ha-bridge-api/src/sinks/mappings.ts` ships the three first-cut entries listed in the PRD (`media.watch.completed`, `finance.balance.low`, `inventory.item.consumed`) with valid Zod-paired JSON-Schema-shaped payload contracts.
- [ ] The bridge's manifest derives its `sinks.descriptors` block from `mappings.map(m => ({ eventType, description, schema }))` — no hand-maintained second list of event types.
- [ ] For each mapping, the bridge HTTP layer wires `createSinkHandler({ eventType, schema, handler })` from `@pops/pillar-sdk/server` and mounts it at `POST /_sinks/<eventType>`.
- [ ] A boot-time validator rejects duplicate `eventType` entries in `mappings` with a structured error pointing at the offending entries.
- [ ] A unit test asserts every mapping's `eventType` matches the `<source>.<entity>.<action>` regex from PRD-236 US-01.
- [ ] A unit test asserts every mapping's `transformInline` is pure: same input → deep-equal output across two consecutive calls.
- [ ] A unit test asserts the manifest `sinks.descriptors` block is exactly `mappings.length` long and round-trips each `eventType`.

## Notes

- Reference [PRD-236](../236-sinks-manifest-dimension/README.md) for the `sinks.descriptors` schema shape and the `createSinkHandler` contract. Reuse — do not re-derive.
- Reference [PRD-229](../229-ha-bridge-pillar/README.md) US-05 for the pillar's existing manifest registration code path; this story plugs into it.
- The runtime Zod registry (PRD-236 US-02) needs every `mapping.eventType` to have an in-process Zod instance. Register them at boot in the same module that exports `mappings` to avoid drift.
- The transform default — when `transformInline` is omitted — should be `(payload) => payload`. Spell this out in code (not via TypeScript optional chaining trickery) so the contract test catches a missing transform as a config bug, not a silent identity.
- The HA WebSocket client + queue logic ships in US-02. This story stubs `sendFireEvent` as a function whose signature is fixed (`(haEventName: string, eventData: Record<string, unknown>) => Promise<void>`) and whose body throws `not-implemented`. US-02 fills it in.
