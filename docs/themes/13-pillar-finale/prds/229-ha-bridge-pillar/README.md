# PRD-229: Home Assistant bridge pillar

> Epic: [Bridge pillars (HA, MQTT, ESPHome)](../../epics/13-bridge-pillars.md)

## Status

Done — all five user stories shipped. US-01 retention worker cron is the one explicit follow-up (separate PRD).

## Overview

Stand up `pops-ha-bridge-api` — the first "bridge pillar" per [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md). The pillar subscribes to a Home Assistant instance's WebSocket API, mirrors every entity + its state into a local per-pillar SQLite, and exposes the data through POPS's standard `searchAdapter` + `aiTools` manifest dimensions. Outbound flows (POPS turning off a light, sending a notification through HA) ship through a new `sinks` manifest dimension introduced by this PRD.

The pillar has the same shape as `pops-finance-api` / `pops-media-api`: a self-contained container, a per-pillar SQLite, a contract package (`@pops/contract-ha-bridge`), and a manifest registered with the central registry on boot. The only thing that makes it a "bridge" is that its source of truth is upstream (HA), not user-entered data.

## Data Model

Per-pillar SQLite at `apps/pops-ha-bridge-api/data/ha-bridge.db`. Two tables.

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

Indexes: `(entity_id, observed_at DESC)`. Retention enforced by a periodic worker — see Business Rules.

## API Surface

### Read endpoints (tRPC on `pops-ha-bridge-api`)

| Procedure           | Input                                                      | Output                                                                      |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `entities.list`     | `{ domain?: string; area?: string; deviceClass?: string }` | `{ entities: HaEntity[] }`                                                  |
| `entities.get`      | `{ entityId: string }`                                     | `{ entity: HaEntity } \| { kind: 'not-found' }`                             |
| `entities.history`  | `{ entityId: string; sinceMs: number; untilMs?: number }`  | `{ samples: { state: string; observedAt: number }[] }`                      |
| `connection.status` | `{}`                                                       | `{ kind: 'connected' \| 'reconnecting' \| 'offline'; lastEventAt: number }` |

### New manifest dimensions

The bridge pillar's manifest (consumed by the central registry) declares three dimensions; the first two reuse existing infrastructure, the third is new.

| Dimension       | Shape                                                                                                     | Notes                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchAdapter` | `{ id: 'ha-entities', label: 'Home Assistant entities' }`                                                 | Discovered by Epic 06's search registry; queries hit FTS5 over `ha_entities`. Matches on friendly name + area + device class.                                 |
| `aiTools`       | `[ 'ha.entity.list', 'ha.entity.getState', 'ha.entity.callService' ]`                                     | Discovered by Epic 07's AI registry. First two are read; `callService` is the outbound control surface.                                                       |
| `sinks` _(new)_ | `[ { id: 'ha.notify', accepts: { kind: 'notification', schema: <zod> } }, { id: 'ha.event.fire', ... } ]` | Declares which event shapes the pillar accepts from other pillars and forwards to HA. Manifest-only in this PRD; full generalisation deferred to its own PRD. |

### Outbound control

`ha.entity.callService` AI-tool input: `{ domain: string; service: string; entityId?: string; data?: Record<string, unknown> }`. Bridge translates to HA WebSocket `call_service` message. Output: `{ kind: 'ok' } | { kind: 'rejected'; reason: 'pillar-unavailable' | 'ha-offline' | 'service-not-found' }`.

## Business Rules

- **HA reconnect on disconnect.** The WebSocket client uses exponential backoff (1s, 2s, 4s, ... capped at 60s). On reconnect, the bridge re-subscribes to `state_changed` and runs a full snapshot fetch (`get_states`) to reconcile any missed state during the outage. `connection.status` reflects the live state for observability.
- **State-change debouncing.** State-changed events are debounced per `entity_id` at 200ms — if HA fires three updates for the same entity inside 200ms (common for sensors), only the last is written to `ha_state_history`. The `ha_entities` upsert always reflects the latest. Debouncing is per-entity, not global.
- **Secret management.** `HA_URL` and `HA_TOKEN` are read from env at boot. `HA_TOKEN` is a long-lived HA access token; it is never logged, never returned by any tRPC procedure, and never written to the manifest. If `HA_TOKEN` is missing or rejected on connect, the pillar boots in degraded mode — manifest still registers, `connection.status` returns `offline`, all read endpoints return empty, `callService` returns `{ kind: 'rejected', reason: 'ha-offline' }`.
- **Retention.** `ha_state_history` is pruned by a periodic worker (default: rows older than 30 days deleted; configurable via `HA_HISTORY_RETENTION_DAYS`). The current-state row in `ha_entities` is never pruned.
- **Registration.** On boot, the pillar registers with `core.registry` like every other pillar (Epic 02). Manifest includes the three dimensions above plus standard `id: 'ha-bridge'`, `baseUrl`, `health`, contract version.
- **Search ranking.** The `searchAdapter` boosts matches where the query token matches `area` or `device_class` exactly. "kitchen temperature" → exact-match `area=kitchen` + `device_class=temperature` ranks above any friendly-name match.

## Edge Cases

| Case                                        | Behaviour                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA offline at boot                          | Pillar boots in degraded mode (see Secret management). Health endpoint reports `degraded`; central registry surfaces this to consumers. Reconnect loop runs until HA is reachable.                                                                                                                                    |
| HA offline mid-session                      | `connection.status` flips to `reconnecting`; read endpoints continue to serve cached `ha_entities` snapshot; `callService` returns `{ kind: 'rejected', reason: 'ha-offline' }`.                                                                                                                                      |
| Entity renamed in HA                        | HA sends `entity_registry_updated`; bridge updates `friendly_name` / `area` on the existing row. The `entity_id` itself does not change unless explicitly renamed in HA — in that case the old row is left and a new row inserted; a daily reconciliation worker (see retention) drops orphans not seen for >30 days. |
| Entity removed in HA                        | `entity_registry_removed` event → bridge sets `last_seen` to current time but leaves the row until the daily reconciliation prunes it. History rows are retained until the global retention window applies.                                                                                                           |
| Large state history (high-frequency sensor) | Debouncing at 200ms caps insert rate per entity. Retention worker prunes older than the configured window. Index on `(entity_id, observed_at DESC)` keeps history queries O(log n + k).                                                                                                                               |
| `callService` to unknown service            | Bridge does not pre-validate against HA's service registry — HA's response (`service_not_found`) is mapped to `{ kind: 'rejected', reason: 'service-not-found' }`.                                                                                                                                                    |
| `HA_TOKEN` rotated without restart          | Bridge detects auth-required frame on next reconnect, attempts the new token from env (if container has been re-deployed). If still rejected: stays in degraded mode and surfaces `connection.status: 'offline'`.                                                                                                     |
| Search query before first snapshot          | If `ha_entities` is empty (cold boot, HA not yet contacted), `searchAdapter` returns `{ items: [] }`; AI tools return `{ kind: 'pillar-unavailable' }` so cerebrum can degrade gracefully.                                                                                                                            |

## User Stories

| #   | Story                                                       | Summary                                                                                                                                       | Parallelisable   | Status                                      |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- |
| 01  | [us-01-ws-subscriber-mirror](us-01-ws-subscriber-mirror.md) | WebSocket subscriber + entity mirror — connect to HA, subscribe to `state_changed`, write `ha_entities` + `ha_state_history`; reconnect loop. | Foundation       | Done (retention worker cron is a follow-up) |
| 02  | [us-02-search-adapter](us-02-search-adapter.md)             | `searchAdapter` over `ha_entities` with FTS5 + area/device-class ranking; registered via manifest.                                            | Blocked by us-01 | Done                                        |
| 03  | [us-03-ai-tools-read](us-03-ai-tools-read.md)               | `ha.entity.list` + `ha.entity.getState` AI tools — read-only surface registered via manifest.                                                 | Blocked by us-01 | Done                                        |
| 04  | [us-04-ai-tool-call-service](us-04-ai-tool-call-service.md) | `ha.entity.callService` AI tool — outbound control via HA WebSocket `call_service`; rejection-shape discriminants.                            | Blocked by us-01 | Done                                        |
| 05  | [us-05-sinks-outbound](us-05-sinks-outbound.md)             | `sinks` manifest dimension — pillar accepts `ha.notify.send` + `ha.event.fire` events from other pillars and forwards to HA.                  | Blocked by us-04 | Done                                        |

## Out of Scope

- MQTT and ESPHome bridges — own PRDs once the HA shape is proven
- Bidirectional ownership / write-back of POPS-managed data into HA entities (e.g. exposing `finance.budgets.list` as HA sensors) — that direction is for a later PRD once `sinks` is generalised
- HA add-on packaging — the bridge runs as a normal POPS pillar container; no HA-supervisor integration
- Replacing HA's UI — Lovelace stays; POPS surfaces HA entities through search + chat, not as a dashboard
- Multi-HA-instance fan-out — single HA instance per bridge container; multi-instance support is a deployment concern, not a PRD
