# Idea: Home Assistant bridge pillar

> Status: Future — no code yet. The reference [bridge pillar](bridge-pillars.md); build it when we prioritise mirroring a device ecosystem into POPS.

## The idea

Stand up `ha-bridge` — the first bridge pillar. It subscribes to a Home Assistant instance's WebSocket API, mirrors every entity and its state into a local per-pillar SQLite, and exposes that data through POPS's standard `searchAdapter` and `aiTools` manifest dimensions. Outbound flows (POPS turning off a light, sending a notification through HA) ride the `sinks` manifest dimension.

The pillar has the same shape as any POPS pillar (`finance`, `media`, ...): a self-contained container, a per-pillar SQLite, a REST contract (ts-rest + zod, emitting OpenAPI), a `./manifest` export, and self-registration with the `registry` pillar on boot. The only thing that makes it a "bridge" is that its source of truth is upstream (HA), not user-entered data. Ports land in the standard pillar range, after the existing fleet.

## Data model

Per-pillar SQLite at `pillars/ha-bridge/data/ha-bridge.db`. Two tables.

### `ha_entities`

Current snapshot of every HA entity the bridge knows about. One row per entity. Upserted on every state change.

| Column          | Type               | Notes                                                                      |
| --------------- | ------------------ | -------------------------------------------------------------------------- |
| `entity_id`     | `TEXT PRIMARY KEY` | HA's entity id (`light.kitchen_ceiling`)                                   |
| `domain`        | `TEXT NOT NULL`    | Derived from `entity_id` prefix (`light`, `sensor`, `switch`, ...)         |
| `friendly_name` | `TEXT`             | From HA's `attributes.friendly_name`                                       |
| `area`          | `TEXT`             | Resolved area name via HA area registry (`kitchen`, `office`)              |
| `device_class`  | `TEXT`             | From `attributes.device_class` (`temperature`, `motion`, ...)              |
| `unit`          | `TEXT`             | From `attributes.unit_of_measurement`                                      |
| `state`         | `TEXT NOT NULL`    | Last known state string (`on`, `off`, `23.4`)                              |
| `attributes`    | `TEXT NOT NULL`    | Full JSON blob of `attributes` from the last state-changed event           |
| `last_changed`  | `INTEGER NOT NULL` | Unix epoch ms — when HA reported the state-changed event                   |
| `last_seen`     | `INTEGER NOT NULL` | Unix epoch ms — when the bridge last received any signal about this entity |

Indexes: `(domain)`, `(area)`, `(device_class)`. FTS5 virtual table `ha_entities_fts(entity_id, friendly_name, area, device_class)` for the `searchAdapter`.

### `ha_state_history`

Append-only log of every state-changed event the bridge observes after debouncing. Used for trend queries and time-series-shaped questions ("what was the kitchen temperature an hour ago?").

| Column        | Type                                | Notes                                                                      |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT` |                                                                            |
| `entity_id`   | `TEXT NOT NULL`                     | FK → `ha_entities.entity_id` (logical; not enforced for retention reasons) |
| `state`       | `TEXT NOT NULL`                     |                                                                            |
| `attributes`  | `TEXT NOT NULL`                     | JSON                                                                       |
| `observed_at` | `INTEGER NOT NULL`                  | Unix epoch ms                                                              |

Indexes: `(entity_id, observed_at DESC)`. Retention enforced by a periodic worker — see Rules.

## REST API surface

Read endpoints on the `ha-bridge` pillar (ts-rest contract, emitted in OpenAPI):

| Method & path                     | Query / params                | Response                                                                    |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `GET /entities`                   | `?domain=&area=&deviceClass=` | `{ entities: HaEntity[] }`                                                  |
| `GET /entities/:entityId`         | path `entityId`               | `{ entity: HaEntity }` or `404`                                             |
| `GET /entities/:entityId/history` | `?sinceMs=&untilMs=`          | `{ samples: { state: string; observedAt: number }[] }`                      |
| `GET /connection`                 | —                             | `{ kind: 'connected' \| 'reconnecting' \| 'offline'; lastEventAt: number }` |

### Manifest dimensions

The bridge's manifest declares three dimensions, all reusing existing POPS platform infrastructure:

| Dimension       | Shape                                                                                         | Notes                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchAdapter` | `{ id: 'ha-entities', label: 'Home Assistant entities' }`                                     | Discovered by the search registry; queries hit FTS5 over `ha_entities`. Matches on friendly name + area + device class.                        |
| `aiTools`       | `[ 'ha.entity.list', 'ha.entity.getState', 'ha.entity.callService' ]`                         | Discovered by the AI registry. First two are read; `callService` is the outbound control surface.                                              |
| `sinks`         | descriptors derived from the bridge's mapping config (`ha.notify.send`, `ha.event.fire`, ...) | Declares which event shapes the pillar accepts from other pillars (over `POST /_sinks/<eventType>`) and forwards to HA. See the outbound idea. |

### Outbound control

`ha.entity.callService` AI-tool input: `{ domain: string; service: string; entityId?: string; data?: Record<string, unknown> }`. The bridge translates this to an HA WebSocket `call_service` message. Output: `{ kind: 'ok' } | { kind: 'rejected'; reason: 'pillar-unavailable' | 'ha-offline' | 'service-not-found' }`.

## Rules

- **HA reconnect on disconnect.** The WebSocket client uses exponential backoff (1s, 2s, 4s, ... capped at 60s). On reconnect, the bridge re-subscribes to `state_changed` and runs a full snapshot fetch (`get_states`) to reconcile any missed state during the outage. The `GET /connection` endpoint reflects the live state for observability.
- **State-change debouncing.** State-changed events are debounced per `entity_id` at 200ms — if HA fires three updates for the same entity inside 200ms (common for sensors), only the last is written to `ha_state_history`. The `ha_entities` upsert always reflects the latest. Debouncing is per-entity, not global.
- **Secret management.** `HA_URL` and `HA_TOKEN` are read from env at boot. `HA_TOKEN` is a long-lived HA access token; it is never logged, never returned by any endpoint, and never written to the manifest. If `HA_TOKEN` is missing or rejected on connect, the pillar boots in degraded mode — the manifest still registers, `GET /connection` returns `offline`, all read endpoints return empty, `callService` returns `{ kind: 'rejected', reason: 'ha-offline' }`.
- **Retention.** `ha_state_history` is pruned by a periodic worker (default: rows older than 30 days deleted; configurable via `HA_HISTORY_RETENTION_DAYS`). The current-state row in `ha_entities` is never pruned.
- **Registration.** On boot, the pillar self-registers with the `registry` pillar like every other pillar, using the standard pillar SDK bootstrap helper. The manifest includes the three dimensions above plus the standard `id: 'ha-bridge'`, `baseUrl`, `health`, and contract version.
- **Search ranking.** The `searchAdapter` boosts matches where the query token matches `area` or `device_class` exactly. "kitchen temperature" → exact-match `area=kitchen` + `device_class=temperature` ranks above any friendly-name match.

## Edge cases

| Case                                        | Behaviour                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA offline at boot                          | Pillar boots in degraded mode (see Secret management). Health reports `degraded`; the registry surfaces this to consumers. Reconnect loop runs until HA is reachable.                                                                             |
| HA offline mid-session                      | `GET /connection` flips to `reconnecting`; read endpoints keep serving the cached `ha_entities` snapshot; `callService` returns `{ kind: 'rejected', reason: 'ha-offline' }`.                                                                     |
| Entity renamed in HA                        | HA sends `entity_registry_updated`; bridge updates `friendly_name` / `area` on the existing row. If `entity_id` itself is renamed, the old row is left and a new row inserted; a daily reconciliation worker drops orphans not seen for >30 days. |
| Entity removed in HA                        | `entity_registry_removed` → bridge sets `last_seen` to now but leaves the row until the daily reconciliation prunes it. History rows retained until the global window applies.                                                                    |
| Large state history (high-frequency sensor) | Debouncing at 200ms caps insert rate per entity. Retention worker prunes older than the window. Index on `(entity_id, observed_at DESC)` keeps history queries O(log n + k).                                                                      |
| `callService` to unknown service            | Bridge does not pre-validate against HA's service registry — HA's `service_not_found` response is mapped to `{ kind: 'rejected', reason: 'service-not-found' }`.                                                                                  |
| `HA_TOKEN` rotated without restart          | Bridge detects an auth-required frame on next reconnect and attempts the new token from env (if the container was re-deployed). If still rejected, stays degraded and surfaces `offline`.                                                         |
| Search query before first snapshot          | If `ha_entities` is empty (cold boot, HA not yet contacted), `searchAdapter` returns `{ items: [] }`; AI tools return `{ kind: 'pillar-unavailable' }` so cerebrum degrades gracefully.                                                           |

## What "built" looks like

Forward-looking acceptance criteria, grouped by the capability they prove. None are implemented yet.

### WebSocket subscriber + entity mirror (foundation)

- [ ] Pillar boots, reads `HA_URL` + `HA_TOKEN` from env, opens a WebSocket connection to HA, and completes the auth handshake.
- [ ] On connect, fetches a full snapshot via `get_states` and upserts every entity into `ha_entities` (schema per Data model).
- [ ] After snapshot, subscribes to `state_changed` and updates `ha_entities` + appends to `ha_state_history` for every event.
- [ ] State-changed events are debounced per `entity_id` at 200ms before hitting `ha_state_history` (only the latest in a 200ms window is recorded).
- [ ] On disconnect, reconnects with exponential backoff (1s → 2s → 4s → ..., capped at 60s) and re-runs snapshot reconciliation before re-subscribing.
- [ ] `HA_TOKEN` never appears in logs, REST responses, or the registered manifest.
- [ ] If `HA_URL` / `HA_TOKEN` are missing or rejected, the pillar still boots, registers with the registry, and `GET /connection` returns `{ kind: 'offline' }`.
- [ ] A retention worker deletes `ha_state_history` rows older than `HA_HISTORY_RETENTION_DAYS` (default 30) on a daily schedule.
- [ ] Unit tests cover: snapshot upsert, state-change upsert + history append, debouncing window, reconnect backoff, degraded-mode boot.

### `searchAdapter` over HA entities

- [ ] FTS5 virtual table `ha_entities_fts(entity_id, friendly_name, area, device_class)` exists, populated by triggers on `ha_entities` insert / update / delete.
- [ ] The manifest declares `searchAdapter: { id: 'ha-entities', label: 'Home Assistant entities' }`, discovered by the registry and the search registry.
- [ ] The adapter implements the `SearchAdapter` interface from `@pops/pillar-sdk`: takes a query string, returns `{ items: { id: string; label: string; score: number; metadata: { domain, area, deviceClass, state } }[] }`.
- [ ] Ranking: exact-match `area` token raises score; exact-match `device_class` token raises score; friendly-name FTS5 rank is the baseline.
- [ ] Query "kitchen temperature" against a seeded fixture (`sensor.kitchen_temperature`, `area=kitchen`, `device_class=temperature`) returns that entity as the top result.
- [ ] If `ha_entities` is empty (cold boot), the adapter returns `{ items: [] }` without error.
- [ ] Unit tests cover: tokenisation, ranking, area/device-class boosts, empty-table case, FTS rebuild after entity rename.

### AI tools for reads (`entity.list`, `entity.getState`)

- [ ] The manifest declares `aiTools: ['ha.entity.list', 'ha.entity.getState']`, discovered by the AI registry.
- [ ] `ha.entity.list` input (zod): `{ domain?: string; area?: string; deviceClass?: string }`. Output: `{ entities: { entityId, friendlyName, area, deviceClass, state }[] }`. Caps the response at 200 entities; if more match, returns `{ entities: [...], truncated: true }`.
- [ ] `ha.entity.getState` input: `{ entityId: string }`. Output: `{ entityId, friendlyName, state, attributes, lastChanged }` or `{ kind: 'not-found' }`.
- [ ] Both tools have JSON-schema-compatible descriptions for the LLM (`description`, `parameters`), sourced from the pillar's contract.
- [ ] Calling either tool when the bridge is in degraded mode returns `{ kind: 'pillar-unavailable' }` (does not throw).
- [ ] Unit tests cover: domain/area/deviceClass filtering, truncation at 200, not-found, degraded mode.
- [ ] Integration test: register the manifest with a stub AI registry, invoke each tool via the registry-discovered handle, assert the response shape.

### AI tool for control (`entity.callService`)

- [ ] The manifest's `aiTools` includes `ha.entity.callService` (additive to the read tools).
- [ ] Input (zod): `{ domain: string; service: string; entityId?: string; data?: Record<string, unknown> }`. Output: `{ kind: 'ok' } | { kind: 'rejected'; reason: 'pillar-unavailable' | 'ha-offline' | 'service-not-found' | 'invalid-input' }`.
- [ ] On invocation, the bridge sends an HA WebSocket `call_service` frame and awaits the result; success returns `{ kind: 'ok' }`.
- [ ] HA error responses are mapped: `service_not_found` → `service-not-found`; auth / connection errors → `ha-offline`.
- [ ] In degraded mode, the tool returns `{ kind: 'rejected', reason: 'ha-offline' }` immediately without enqueueing.
- [ ] The tool's JSON-schema description for the LLM lists common safe-control examples (`light.turn_off`, `switch.toggle`, `scene.turn_on`).
- [ ] Unit tests cover: success, `service_not_found` mapping, degraded mode, invalid input, timeout (HA does not respond within 10s — treated as `ha-offline`).

### `sinks` manifest dimension for outbound events

- [ ] The manifest declares HA-native sinks via the mapping config: `ha.notify.send` and `ha.event.fire` are projected into `sinks.descriptors`.
- [ ] The registry exposes the `sinks` dimension to discovery clients (additive to existing dimensions).
- [ ] `ha.notify.send` schema: `{ service?: string; message: string; title?: string; target?: string | string[]; data?: Record<string, unknown> }`. Default service `notify`. The bridge translates to `call_service` on `notify.<service>` with the supplied target.
- [ ] `ha.event.fire` schema: `{ eventType: string; eventData?: Record<string, unknown> }`. The bridge translates to a `fire_event` WebSocket frame with the publisher-supplied `event_type` and `event_data`.
- [ ] A sink invocation returns `200` with `{ outcome: 'sent' | 'queued' }`, or `400` with `{ error: 'invalid-payload', issues }`. Frames are accepted while reconnecting and drained on the next handshake.
- [ ] Sink invocations are validated against the published zod schema before they hit HA. Invalid payload → `400 { error: 'invalid-payload' }`.
- [ ] When reconnecting, HA-native frames enqueue on the existing bounded reconnect queue and drain on the next handshake.
- [ ] Unit tests cover: schema validation, default service for `ha.notify.send`, event-fire mapping, reconnect-queue path.
- [ ] Integration test: bridge router e2e — publish to `/_sinks/ha.notify.send` and assert the bridge dispatches the expected `call_service` frame.

> Sink event-type IDs are three-segment (`ha.notify.send`, `ha.event.fire`) to satisfy the federation-wide `<source>.<entity>.<action>` regex enforced by the `sinks` mechanism.

## Out of scope (first cut)

- MQTT and ESPHome bridges — their own ideas once the HA shape is proven.
- Bidirectional write-back of POPS-managed data into HA entities (e.g. exposing finance budgets as HA sensors) — a later idea once `sinks` is generalised.
- HA add-on packaging — the bridge runs as a normal POPS pillar container; no HA-supervisor integration.
- Replacing HA's UI — Lovelace stays; POPS surfaces HA entities through search and chat, not as a dashboard.
- Multi-HA-instance fan-out — single HA instance per bridge container; multi-instance is a deployment concern.
- An allowlist gate on `callService` — that policy belongs to the AI orchestrator, not the bridge.
