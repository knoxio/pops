# Idea: Bridge pillars (Home Assistant, MQTT, ESPHome)

> Status: Future — no code yet. Build when we deliberately prioritise integrating an upstream device ecosystem.

## The idea

A **bridge pillar** is a thin POPS pillar whose source of truth is an upstream system instead of user-entered data. It subscribes to that system (a Home Assistant WebSocket, an MQTT broker, ESPHome's native API), mirrors the upstream's entities into its own per-pillar SQLite, and exposes them through POPS's standard manifest dimensions — `searchAdapter` (so the entities show up in federated search) and `aiTools` (so cerebrum can read and control them). Outbound flows — POPS publishing events back to the upstream — ride the existing `sinks` manifest dimension.

A bridge pillar has the exact same shape as any other POPS pillar: a self-contained container, a per-pillar SQLite, a REST contract (ts-rest + zod under `src/contract/`, emitting OpenAPI), a `./manifest` export, and self-registration with the `registry` pillar on boot. The only thing that makes it a "bridge" is the direction of authority: the upstream owns the data, the bridge mirrors it.

POPS does not compete with Home Assistant on device count. Instead, every upstream entity becomes searchable and AI-callable inside POPS through a single bridge pillar — additive integration, not replacement.

## Why this matters

- Cerebrum chat can answer "is the kitchen light on?" and act on "turn off the office heater" with no bespoke integration code — the bridge's `aiTools` are discovered through the AI registry like any other pillar's.
- Federated search treats upstream entities as first-class POPS results.
- POPS becomes additive to an existing Home Assistant install rather than a competitor to it.

## The pattern

Home Assistant is the reference bridge — it proves the shape. MQTT and ESPHome bridges follow the same pattern and reuse the manifest-dimension work rather than being designed from scratch:

| Bridge           | Upstream                     | Mirrors                     |
| ---------------- | ---------------------------- | --------------------------- |
| `ha-bridge`      | Home Assistant WebSocket API | every HA entity + its state |
| `mqtt-bridge`    | MQTT broker                  | topics as entities          |
| `esphome-bridge` | ESPHome native API           | ESPHome devices             |

Each new bridge forks from the HA shape: same `searchAdapter` + `aiTools` + `sinks` wiring, different upstream client.

See the detailed forward-looking ideas:

- [HA bridge pillar](ha-bridge-pillar.md) — the reference bridge: mirror HA entities, expose search + AI tools, accept outbound sinks.
- [pops → HA event publisher](pops-to-ha-event-publisher.md) — wire the HA bridge as the first real consumer of the `sinks` dimension so POPS events become HA `fire_event` calls.

## Boundaries (when we build it)

- **Not an automation engine.** Automations stay in Home Assistant; POPS only observes and controls. No replacement of HA's automation logic, no `automation.yaml` generation.
- **Not a device driver.** HA owns the integration layer (Zigbee, Z-Wave, Matter). The bridge consumes HA's entity model, never the raw device protocols.
- **No state-ownership conflicts.** The upstream is authoritative for its own entities; the bridge does not try to "own" an entity's state.
- **No voice / wake-word / TTS.** That is HA's job (and Rhasspy / Whisper). POPS consumes the resulting transcript through the existing cerebrum chat surface.
- **No HA add-on packaging.** A bridge runs as a normal POPS pillar container, not as an HA-supervisor add-on.
- **No Lovelace replacement.** HA's UI stays; POPS surfaces upstream entities through search and chat, not as a dashboard.
