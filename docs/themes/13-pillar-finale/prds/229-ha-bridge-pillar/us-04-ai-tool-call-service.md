# US-04: AI tool for HA control (`entity.callService`)

> PRD: [HA bridge pillar](README.md)

## Description

As cerebrum's chat surface, I want to call `ha.entity.callService` as an AI tool so that the LLM can turn off a light, toggle a switch, or trigger an HA scene in response to "turn off the office heater" without bypassing the bridge pillar's discipline.

## Acceptance Criteria

- [ ] The pillar's manifest declares `aiTools` includes `ha.entity.callService` (additive to US-03's list).
- [ ] Input schema (Zod): `{ domain: string; service: string; entityId?: string; data?: Record<string, unknown> }`. Output: `{ kind: 'ok' } | { kind: 'rejected'; reason: 'pillar-unavailable' | 'ha-offline' | 'service-not-found' | 'invalid-input' }`.
- [ ] On invocation, the bridge sends an HA WebSocket `call_service` frame and awaits the result; success returns `{ kind: 'ok' }`.
- [ ] HA's error responses are mapped: `service_not_found` → `service-not-found`; auth / connection errors → `ha-offline`.
- [ ] When the bridge is in degraded mode, the tool returns `{ kind: 'rejected', reason: 'ha-offline' }` immediately without enqueueing.
- [ ] The tool's JSON-schema description for the LLM lists common safe-control examples (`light.turn_off`, `switch.toggle`, `scene.turn_on`) — exposed via the contract package.
- [ ] Unit tests cover: success, `service_not_found` mapping, degraded mode, invalid input, timeout (HA does not respond within 10s — treat as `ha-offline`).

## Notes

- Depends on US-01.
- This is the first outbound surface from POPS → HA. The pattern it establishes is reused by US-05's `sinks`.
- The tool is not gated by an allowlist in this PRD — that policy belongs to the AI orchestrator (Epic 07), not the bridge.
- Audit logging of every `callService` invocation to `ha_state_history` (with a synthetic entity id) is a candidate follow-up but out of scope here.
