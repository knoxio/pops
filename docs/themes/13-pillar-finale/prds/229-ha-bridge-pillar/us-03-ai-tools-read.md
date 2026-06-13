# US-03: AI tools for HA reads (`entity.list`, `entity.getState`)

> PRD: [HA bridge pillar](README.md)

## Description

As cerebrum's chat surface, I want to call `ha.entity.list` and `ha.entity.getState` as registered AI tools so that the LLM can answer "what HA entities are in the kitchen?" and "is the kitchen light on?" without any custom integration code.

## Acceptance Criteria

- [ ] The pillar's manifest declares `aiTools: ['ha.entity.list', 'ha.entity.getState']` and is discovered by the AI registry (Epic 07).
- [ ] `ha.entity.list` input schema (Zod): `{ domain?: string; area?: string; deviceClass?: string }`. Output: `{ entities: { entityId, friendlyName, area, deviceClass, state }[] }`. Caps response at 200 entities; if more match, returns `{ entities: [...], truncated: true }`.
- [ ] `ha.entity.getState` input: `{ entityId: string }`. Output: `{ entityId, friendlyName, state, attributes, lastChanged }` or `{ kind: 'not-found' }`.
- [ ] Both tools have JSON-schema-compatible descriptions for the LLM (`description`, `parameters`) — sourced from the contract package `@pops/contract-ha-bridge`.
- [ ] Calling either tool when the bridge is in degraded mode (HA offline) returns `{ kind: 'pillar-unavailable' }` per the standard SDK discriminant — does not throw.
- [ ] Unit tests cover: domain/area/deviceClass filtering, truncation at 200, not-found, degraded mode.
- [ ] Integration test: register the manifest with a stub AI registry, invoke each tool via the registry-discovered handle, assert response shape.

## Notes

- Depends on US-01.
- Outbound control (`ha.entity.callService`) is US-04 — strictly read-only here.
- The AI registry's tool-discovery shape is defined by Epic 07 / PRD-202. This story consumes it.
