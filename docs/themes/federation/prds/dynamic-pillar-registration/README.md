# Dynamic pillar registration

> Theme: [Federation](../../README.md) · Epic: [Central registry](../../../13-pillar-finale/epics/02-central-registry.md)

> Status: Done

## Overview

Any pillar process — whether it ships from this repo or from a different
repository entirely — joins the fleet at runtime by POSTing the registry pillar
on boot. No compile-time pillar list, no rebuild of the shell, no code change in
this repo. The registry (port `3001`) is the single source of truth for which
pillars exist; the shell renders its nginx dispatcher from a live registry
snapshot and re-renders on every registry event, so a freshly registered pillar
becomes routable within seconds.

A pillar registers, heartbeats every 10s, and deregisters on clean shutdown
against three plain HTTP-JSON routes on the registry. Each registration is
tagged `internal` (in-tree bootstrap path) or `external` (registered over the
network from another repo). External rows that stop heartbeating are
hard-evicted; internal rows are left alone to come back when their container
restarts.

This is the final piece that makes a pillar a self-contained, drop-in unit:
build a container that speaks the contract, put it on the docker network, point
it at the registry — it appears in the dispatcher and starts serving traffic.

## Trust model

The docker network is the trust boundary (ADR-027). The register / heartbeat /
deregister routes are **not** exposed through the shell's public nginx — they
are reachable only from inside the compose network, where each pillar-api boots
and POSTs directly to `http://registry-api:3001/registry/register`. Anything
able to reach the registration surface is already inside the bridge, so the
registration handshake carries no per-request credential. The `internal` vs
`external` distinction is recorded in the `origin` column, not enforced by
authentication.

## Data model

One row per pillar in the registry pillar's SQLite DB (`pillar_registry`).
A registration is one row; re-registration UPSERTs it.

| Column                                                 | Type | Notes                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pillar_id`                                            | TEXT | Primary key. Lowercase-kebab id (`finance`, `media`, …). One row per pillar.                                                                                                                                          |
| `base_url`                                             | TEXT | Reachable from inside the docker network (e.g. `http://recipes-api:4010`).                                                                                                                                            |
| `manifest_json`                                        | TEXT | Verbatim `ManifestPayload` the pillar POSTed, validated before persist. Invalid manifests never land.                                                                                                                 |
| `contract_package`, `contract_version`, `contract_tag` | TEXT | Denormalised from the manifest so consumers filter/index without a JSON parse.                                                                                                                                        |
| `registered_at`                                        | TEXT | Set on first INSERT, **preserved across UPSERTs**.                                                                                                                                                                    |
| `last_heartbeat_at`                                    | TEXT | Updated on every register (a register counts as a heartbeat) and every explicit heartbeat.                                                                                                                            |
| `status`                                               | TEXT | `'healthy' \| 'unavailable' \| 'unknown'`. `healthy` on register; `unavailable` via missed-heartbeat compute; `unknown` only after a registry restart reconciliation.                                                 |
| `status_updated_at`                                    | TEXT | When `status` last changed. Drives the eviction threshold clock.                                                                                                                                                      |
| `origin`                                               | TEXT | `'internal'` (in-tree bootstrap) or `'external'` (registered over the network). Defaults to `'internal'`. Indexed.                                                                                                    |
| `api_key_hash`                                         | TEXT | Historical/vestigial. New rows write `NULL`; the trust boundary is the docker network, not a shared key. Kept for backward compat.                                                                                    |
| `evicted_at`                                           | TEXT | Set in the emitted event (not persisted on a live row) when the eviction ticker hard-evicts an external pillar.                                                                                                       |
| `capabilities_json`                                    | TEXT | Latest reported `<capabilityKey> → up/down` snapshot, POSTed on register/heartbeat. `NULL` when the pillar reports none. Distinct from the manifest's declarative capability descriptors — this is their live status. |

Indexes: `idx_pillar_registry_status` on `status`, `idx_pillar_registry_origin`
on `origin`.

The schema is the source of truth; the column set above ships as migration
`0058_pillar_registry_external_origin.sql` (origin + api_key_hash + evicted_at +
origin index) and `0068_pillar_registry_capabilities.sql` (capabilities). New
columns backfill existing rows to `origin = 'internal'`, `api_key_hash = NULL`,
`evicted_at = NULL`.

## REST surface

Four raw HTTP-JSON routes on the registry pillar. Not ts-rest, not tRPC — the
register/heartbeat/deregister bodies and the snapshot response are bare JSON the
pillar SDK's transport and discovery read directly. Every route is **dual-served**
on a canonical slash path and a legacy dotted alias (same handler, no logic
duplication) during the rolling-deploy window; the SDK prefers the slash path
and falls back to the dotted alias on a 404. A pass-through metric fires on the
dotted alias so the aliases can be dropped once it reads zero.

| Operation  | Canonical path              | Legacy alias                     |
| ---------- | --------------------------- | -------------------------------- |
| register   | `POST /registry/register`   | `POST /core.registry.register`   |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` |
| snapshot   | `GET /registry/pillars`     | `GET /core.registry.list`        |

### `POST /registry/register`

Request: `{ pillarId, baseUrl, manifest, capabilities? }`. No credential.

1. Parse the body — `pillarId` non-empty string, `baseUrl` a valid URL, `manifest` present, `capabilities` (optional) a flat `<string, boolean>` record. Malformed → 400 with a per-field `issues` array.
2. Reject a `pillarId` that does not match `^[a-z][a-z0-9-]*$` → 400.
3. Validate `manifest` via the SDK's `validateManifestPayload`. Failure → 400 with per-field issues.
4. Cross-field: `manifest.pillar === pillarId`. Mismatch → 400.
5. UPSERT the row with `origin = 'external'`, `api_key_hash = NULL`, `status = 'healthy'`, `registered_at` preserved across re-registration.
6. Emit a `{ event: 'registered', pillarId, entry }` event on the in-process bus.

Response: `{ ok: true, pillarId, registeredAt, heartbeatIntervalMs: 10000 }`.

### `POST /registry/heartbeat`

Request: `{ pillarId, capabilities? }`.

1. Parse the body. Malformed → 400.
2. No row for `pillarId` → `200 { ok: false, reason: 'not-registered' }` (not a 404), so the SDK re-registers cleanly without parsing status codes.
3. On success update `last_heartbeat_at`, reset `status → healthy`, refresh `capabilities_json` if sent. If the status transitioned, emit a `health-changed` event.

Response: `{ ok: true, pillarId, lastHeartbeatAt, status, statusChanged } | { ok: false, reason: 'not-registered' }`.

### `POST /registry/deregister`

Request: `{ pillarId }`.

1. Parse the body. Malformed → 400.
2. No row → `200 { ok: true, removed: false }` (idempotent), no event.
3. Row with `origin = 'internal'` → `403 { ok: false, reason: 'internal-pillar-not-deregisterable-externally' }`. The external surface must not be able to nuke an in-tree pillar; internal pillars manage their own lifecycle.
4. Row with `origin = 'external'` → DELETE, emit `{ event: 'deregistered', pillarId, origin: 'external', reason: 'requested' }`.

Response: `{ ok: true, removed: boolean }`.

### `GET /registry/pillars`

Returns the bare snapshot `{ pillars: RegistryEntry[], fetchedAt }`. `status` is
computed live from `last_heartbeat_at` on every read, so a consumer sees the
freshest state even if the background ticker lags. This is the discovery surface
every pillar's SDK reads; it is also what the shell's dispatcher renders from.

## Lifecycle rules

- **Heartbeat cadence is 10s.** The register response returns
  `heartbeatIntervalMs` so the SDK doesn't hard-code it; the registry can lengthen
  it later without a client change.
- **Missed-heartbeat → unavailable** is computed live (no row mutation needed for
  the read). After 30s of silence a row reads `unavailable`.
- **Hard-eviction of external pillars.** A ticker runs every 30s. Rows with
  `origin = 'external'` AND a live status of `unavailable` AND `status_updated_at`
  older than 5 minutes are DELETEd, and a `{ event: 'deregistered', origin:
'external', reason, evictedAt }` event fires. `reason` is `'never-heartbeated'`
  if the row never recorded a heartbeat past registration (`last_heartbeat_at ===
registered_at`), else `'lost-heartbeat'`. The ticker is exported as a
  synchronous `runEvictionTick` so tests drive it deterministically without the
  real 30s interval.
- **Internal pillars are never hard-evicted** regardless of status — they are
  expected to come back when their container restarts.
- **No multi-instance.** One row per `pillarId`; a second registration overwrites
  the first (last write wins). UPSERT preserves `registered_at`.
- **Deregister reasons** distinguish clean shutdown (`'requested'`) from eviction
  (`'never-heartbeated'`, `'lost-heartbeat'`) so consumers tailing the event
  stream can diagnose.

## Dispatcher integration

The shell renders its nginx dispatcher from the live registry snapshot rather
than a compile-time pillar list, and re-renders on every registry event. The
generator and the registry-watcher live in the shell pillar (`pillars/shell`,
delivered by the shell boot-render + watcher PRDs); this PRD owns the registry
side of the contract — the snapshot the generator reads and the event stream it
subscribes to.

Contract this PRD guarantees to the dispatcher:

- The `GET /registry/pillars` snapshot is the only input the generator needs; it
  carries every registered pillar's `pillarId` + `baseUrl`.
- Every successful register / deregister / eviction emits an event on the
  registry's in-process bus, surfaced to out-of-process consumers over
  `GET /registry/subscribe` (SSE). The shell's watcher subscribes to that stream
  and re-renders + reloads nginx on each event (debounced, `nginx -t`-validated,
  reload-on-pass, keep-current-conf-on-fail).
- A pillar's dispatcher block is keyed off its `baseUrl` (a curated in-cluster
  upstream wins for known ids; otherwise the host:port is parsed from the
  registry `baseUrl`). Re-registration with a different `baseUrl` therefore
  re-points the route on the next reload.

## Edge cases

| Case                                              | Behaviour                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External pillar registers but never heartbeats    | After 30s it reads `unavailable`; 5 minutes later the eviction ticker DELETEs it with `reason: 'never-heartbeated'` + `evictedAt`.                                  |
| External pillar drops off mid-life                | Same eviction path, `reason: 'lost-heartbeat'`.                                                                                                                     |
| Duplicate registration, identical manifest        | UPSERT no-op semantics: `last_heartbeat_at` refreshed, `registered_at` preserved, a `registered` event still fires.                                                 |
| Re-registration with a different `baseUrl`        | UPSERT overwrites; `registered` event fires; dispatcher re-points on the next reload; the old URL stops receiving traffic.                                          |
| Two external pillars race the same `pillarId`     | SQLite serialises writes; last write wins. The loser's heartbeats start returning `not-registered`. Operational misconfig, not the registry's job to mediate.       |
| Heartbeat for a missing row                       | `200 { ok: false, reason: 'not-registered' }`; SDK re-registers.                                                                                                    |
| Deregister of a missing row                       | `200 { ok: true, removed: false }`, no event (idempotent).                                                                                                          |
| Deregister of an `internal` row over this surface | `403 { reason: 'internal-pillar-not-deregisterable-externally' }`.                                                                                                  |
| `baseUrl` the registry/dispatcher can't reach     | Registration succeeds (no liveness probe at register time). The dispatcher forwards to a refused upstream → clients see 502. Operator fixes the URL or deregisters. |
| Manifest invalid for the current schema           | Rejected at register with per-field issues; nothing persists. The external pillar tracks the published contract package semver.                                     |
| Registry restart reconciliation in flight         | A register landing during reconciliation writes a fresh `healthy` row; reconciliation completes around it.                                                          |

## Acceptance criteria

### Schema + register

- [x] Migration adds `origin TEXT NOT NULL DEFAULT 'internal'`, `api_key_hash TEXT`, `evicted_at TEXT`, and an index on `origin`; existing rows backfill to `origin = 'internal'`.
- [x] `POST /registry/register` (canonical) and `POST /core.registry.register` (legacy alias) are served by the registry pillar as raw HTTP-JSON, same handler.
- [x] The handler rejects a malformed body (`pillarId` shape, `baseUrl` URL validity, missing `manifest`, malformed `capabilities`) with 400 + a per-field `issues` array.
- [x] `manifest` is validated via the SDK's `validateManifestPayload`; failure returns 400 with per-field issues.
- [x] Cross-field validation rejects `pillarId !== manifest.pillar` with 400.
- [x] On success the row UPSERTs with `origin = 'external'`, `api_key_hash = NULL`, `status = 'healthy'`, `registered_at` preserved across re-registration.
- [x] Response is `{ ok: true, pillarId, registeredAt, heartbeatIntervalMs: 10000 }`.
- [x] A `{ event: 'registered', pillarId, entry }` event is emitted on the in-process bus.
- [x] Unit tests cover: happy path, malformed body, malformed manifest, cross-field mismatch, re-registration preserves `registered_at`.

### Heartbeat + eviction

- [x] `POST /registry/heartbeat` (+ legacy alias) is served by the registry pillar.
- [x] On success it updates `last_heartbeat_at`, resets `status → healthy`, and emits a `health-changed` event when the status transitioned.
- [x] Zero rows matched returns `200 { ok: false, reason: 'not-registered' }` (not a 404).
- [x] A hard-eviction ticker runs every 30s: rows with `origin = 'external'` AND a live status of `unavailable` AND `status_updated_at` older than 5 minutes are DELETEd, with a `{ event: 'deregistered', origin: 'external', reason: 'never-heartbeated' | 'lost-heartbeat', evictedAt }` event.
- [x] Internal pillars are never hard-evicted regardless of status.
- [x] The eviction pass is exposed as a synchronous `runEvictionTick` for deterministic tests.
- [x] Unit tests cover: happy heartbeat, heartbeat for a missing row, ticker evicts only externals, ticker emits the correct event shape, ticker is a no-op when no rows qualify.

### Deregister

- [x] `POST /registry/deregister` (+ legacy alias) is served by the registry pillar.
- [x] DELETE is idempotent — a missing row returns `{ ok: true, removed: false }` with no event.
- [x] A real DELETE emits `{ event: 'deregistered', origin: 'external', reason: 'requested' }`.
- [x] Deregistering an `origin = 'internal'` pillar via this surface returns `403 { reason: 'internal-pillar-not-deregisterable-externally' }`.
- [x] Unit tests cover: happy path, idempotent DELETE of a missing pillar, refusal to delete an internal pillar.

### Dispatcher contract

- [x] The shell's nginx generator renders from the `GET /registry/pillars` snapshot — no compile-time pillar constant in the render path.
- [x] The same snapshot renders a byte-identical conf (determinism, snapshot-tested).
- [x] The shell's watcher consumes the `GET /registry/subscribe` SSE stream and re-renders + reloads nginx on register / deregister / eviction events, debounced and `nginx -t`-gated.

### End-to-end drop-in

- [x] An integration test boots the registry against a temp-dir SQLite on an ephemeral port plus a throwaway REST pillar on a second port, registers via the register endpoint with a synthetic manifest and the throwaway's `baseUrl`, and asserts `200 { ok: true }`.
- [x] The test asserts the persisted row carries `origin: 'external'`, `status: 'healthy'`, the registered `baseUrl`, and that the snapshot reports the pillar.
- [x] The test drives the real `pillar(id).callDynamic` SDK path for a query and a mutation against the registered pillar and asserts the results route through to the throwaway.
- [x] The test deregisters and asserts the row is gone, the dereg response is `{ ok: true, removed: true }`, and a subsequent `callDynamic` resolves to the `unavailable` shape once discovery refreshes.
- [x] The whole test runs in well under a second (eviction is exercised via `runEvictionTick`, not the real 30s ticker) and tears down the throwaway pillar, the registry server, and the temp DB.

## Out of scope

- **Per-pillar API keys / scoped tokens.** ADR-027's trust model is the docker
  network. If multi-tenant external pillars become real, write a new ADR. The
  shared-key auth design that earlier drafts specified (a `POPS_INTERNAL_API_KEY`,
  `crypto.timingSafeEqual` checks, `api_key_hash` verification, key-rotation
  eviction, reserved-pillar-id 409, and a public-but-key-gated nginx allow-list)
  is captured in [the idea doc](../../../../ideas/dynamic-pillar-registration.md);
  none of it is built — the docker network supersedes it.
- **Active liveness probing of `baseUrl` at register time.** Heartbeat is the
  liveness signal; the registry trusts the pillar at registration.
- **TLS / mTLS between pillars and the registry.** Docker network is the boundary.
- **A discovery UI / admin console.** The snapshot endpoint exposes the data;
  build a UI as a separate PRD if anyone wants it.
- **Versioned compatibility handshakes.** Coordinated-deploy guidance (ADR-031)
  covers schema bumps without bespoke negotiation.
- **Multi-instance pillar registration (HA).** One row per `pillarId`, last write
  wins.
- **Soft delete / audit history of registration events.** The event stream is the
  audit trail; consumers tail it if they need history.
- **Rate limiting** on the register/heartbeat endpoints. Single-host, single-user,
  inside a docker network — not a realistic abuse surface.

## References

- [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md) — the runtime registry as the path for external (non-workspace) pillars; docker network is the trust boundary, so no shared key is needed.
- [Central registry epic](../../../13-pillar-finale/epics/02-central-registry.md) — dynamic pillar registration is the final BE-lego step.
  </content>
  </invoke>
