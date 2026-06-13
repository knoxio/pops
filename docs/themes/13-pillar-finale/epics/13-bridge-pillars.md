# Epic 13: Bridge pillars (HA, MQTT, ESPHome)

> Theme: [Pillar finale](../README.md)

## Scope

Implement the "bridge pillar" pattern declared by [ADR-032](../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md): thin POPS pillars whose job is to subscribe to an upstream system (Home Assistant WebSocket, MQTT broker, ESPHome devices) and expose that data through POPS's standard `searchAdapter` + `aiTools` manifest dimensions. Bridge pillars are also the route for outbound flows — POPS publishing events back to the upstream becomes a new `sinks` manifest dimension.

This epic is a follow-on to Theme 13's main goals (which finish the federated runtime). It implements the additive integration story ADR-032 declared: POPS does not compete with HA on device count; instead, every HA entity becomes searchable + AI-callable inside POPS through a single bridge pillar.

The first bridge — Home Assistant — proves the pattern. MQTT and ESPHome follow the same shape and reuse the manifest-dimension work.

## PRDs

| #   | PRD                                                                        | Summary                                                                                                                           | Status      |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 229 | [HA bridge pillar](../prds/229-ha-bridge-pillar/README.md)                 | `pops-ha-bridge-api` — subscribe to HA WebSocket, mirror entities, expose via `searchAdapter` + `aiTools` + new `sinks` dimension | Not started |
| TBD | MQTT bridge pillar                                                         | `pops-mqtt-bridge-api` — subscribe to MQTT broker, mirror topics as entities                                                      | Not started |
| TBD | ESPHome bridge pillar                                                      | `pops-esphome-bridge-api` — subscribe to ESPHome native API, mirror devices                                                       | Not started |
| 236 | [Sinks manifest dimension](../prds/236-sinks-manifest-dimension/README.md) | First-class `sinks` manifest field + `publishEvent` orchestrator + `/_sinks/<eventType>` endpoint convention (per ADR-034)        | In progress |

PRD-229 (HA) is the reference implementation. MQTT and ESPHome PRDs are deferred until PRD-229 lands — they fork from the HA shape rather than designed from scratch.

## Dependencies

- **Requires:** Epic 00 (contract packages — bridge pillars publish a `@pops/contract-ha-bridge`), Epic 01 (pillar SDK boot helper), Epic 02 (central registry — bridge pillar registers like every other pillar), Epic 06 (search registry — bridge pillar's `searchAdapter` is discovered via the registry), Epic 07 (AI registry — bridge pillar's `aiTools` are discovered via the registry).
- **Unlocks:** the "typed federation for self-hosted apps" writeup framing; cerebrum chat can answer "is the kitchen light on?" and "turn off the office heater"; POPS becomes additive to existing HA installs rather than a competitor.

## Out of Scope

- Replacing HA's automation engine — automations stay in HA, POPS only observes + controls
- Per-device drivers (Zigbee, Z-Wave, Matter) — HA owns the integration layer; the bridge consumes HA's entity model, not the raw device protocols
- Bidirectional state ownership conflicts — HA is authoritative for HA-managed entities; POPS does not try to "own" an entity's state
- The `sinks` manifest dimension's full generalisation — PRD-229 ships the HA-specific shape; a follow-up PRD splits the generic mechanism out once a second bridge needs it
- Voice / wake-word / TTS — that is HA's job (and Rhasspy / Whisper); POPS consumes the resulting transcript via the existing cerebrum chat surface
