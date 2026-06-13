# US-01: WebSocket subscriber + entity mirror

> PRD: [HA bridge pillar](README.md)

## Description

As `pops-ha-bridge-api`, I want to connect to a Home Assistant instance over WebSocket, subscribe to `state_changed`, and mirror every entity into a per-pillar SQLite so that downstream stories (search, AI tools, sinks) have a local, queryable copy of HA state without going back to HA for every request.

## Acceptance Criteria

- [ ] Pillar boots, reads `HA_URL` + `HA_TOKEN` from env, opens a WebSocket connection to HA and completes the auth handshake.
- [ ] On connect, the pillar fetches a full snapshot via `get_states` and upserts every entity into `ha_entities` (schema per PRD § Data Model).
- [ ] After snapshot, the pillar subscribes to `state_changed` and updates `ha_entities` + appends to `ha_state_history` for every event.
- [ ] State-changed events are debounced per `entity_id` at 200ms before they hit `ha_state_history` (only the latest event in a 200ms window is recorded).
- [ ] On disconnect, the pillar reconnects with exponential backoff (1s → 2s → 4s → ..., capped at 60s) and re-runs the snapshot reconciliation before re-subscribing.
- [ ] `HA_TOKEN` never appears in logs, tRPC responses, or the registered manifest.
- [ ] If `HA_URL` / `HA_TOKEN` are missing or rejected, the pillar still boots, registers with the central registry, and `connection.status` returns `{ kind: 'offline' }`.
- [ ] Unit tests cover: snapshot upsert, state-change upsert + history append, debouncing window, reconnect backoff, degraded-mode boot.
- [ ] A retention worker deletes `ha_state_history` rows older than `HA_HISTORY_RETENTION_DAYS` (default 30) on a daily schedule.

## Notes

- This story stands the pillar up but does not expose any read endpoints or AI tools. Those are US-02 / US-03.
- Follow the shape of `apps/pops-finance-api` and `apps/pops-media-api` for container layout and SQLite handling.
- Use `home-assistant-js-websocket` (or a thin in-house client if dependency footprint is a concern) — decision is implementation-level, not a PRD constraint.
- Registration with `core.registry` uses the standard pillar SDK bootstrap helper from Epic 01 (PRD-158).
- See [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) for the positioning context.
