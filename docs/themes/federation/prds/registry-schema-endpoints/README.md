# Registry schema + endpoints

> Theme: [Federation](../../README.md)

## Overview

The runtime registry's persistence layer and HTTP surface. The **registry pillar** (`pillars/registry`, served on `:3001`) owns a single SQLite table — `pillar_registry`, one row per pillar — and a handful of raw HTTP routes that pillars use to announce themselves, prove liveness, and tear down. Sibling pillars discover each other by reading the registry's snapshot; the bootstrap helper in `@pops/pillar-sdk` POSTs the manifest on boot and heartbeats on a timer.

The registry wire is **raw HTTP / SSE, not a ts-rest contract surface and not tRPC**. The discovery snapshot is the bare `{ pillars, fetchedAt }` object the SDK's `HttpDiscoveryTransport` reads directly — no envelope. The mutating routes (`register`, `heartbeat`, `deregister`) are plain JSON POSTs validated by hand-rolled body parsers plus the shared manifest validator.

This PRD ships the data + endpoint primitives:

- the `pillar_registry` schema and migrations,
- the register / heartbeat / deregister / snapshot / subscribe routes,
- the in-process event bus that the SSE stream forwards,
- the live-status projection read off `lastHeartbeatAt`,
- the nginx exposure rules (read-only routes proxied; mutating routes never exposed publicly).

Heartbeat TTL math, the SSE transport contract, and restart reconciliation are described where they touch this surface but are owned by sibling PRDs (heartbeat lifecycle, subscription model, reconciliation on restart). External-pillar drop-in registration and the hard-eviction ticker are owned by the external-registry PRD; this PRD describes the shared persistence and route shape both internal and external callers share.

Source: `pillars/registry/src/api/modules/{external-registry,registry}/`, `pillars/registry/src/db/services/pillar-registry*.ts`, `pillars/registry/migrations/`, `pillars/shell/nginx.conf`. Route paths are owned by `@pops/pillar-sdk` (`REGISTRY_PATHS` / `LEGACY_REGISTRY_PATHS`).

## Data model

### `pillar_registry` (registry pillar's SQLite DB)

One row per pillar. The latest `register` wins (UPSERT).

| Column              | Type          | Notes                                                                                                                         |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pillar_id`         | TEXT PK       | `'finance'`, `'media'`, … (matches `^[a-z][a-z0-9-]*$`)                                                                       |
| `base_url`          | TEXT NOT NULL | `'http://finance-api:3004'` — provided by the pillar at register time                                                         |
| `manifest_json`     | TEXT NOT NULL | JSON blob of the validated `ManifestPayload`                                                                                  |
| `contract_package`  | TEXT NOT NULL | `'@pops/finance'` (collapsed in-pillar package; the validator still accepts the `'@pops/finance-contract'` legacy-split form) |
| `contract_version`  | TEXT NOT NULL | `'1.4.2'`                                                                                                                     |
| `contract_tag`      | TEXT NOT NULL | `'contract-finance@v1.4.2'`                                                                                                   |
| `registered_at`     | TEXT NOT NULL | ISO-8601; set on first INSERT, **preserved on UPSERT**                                                                        |
| `last_heartbeat_at` | TEXT NOT NULL | ISO-8601; rewritten on every register + heartbeat                                                                             |
| `status`            | TEXT NOT NULL | `'healthy' \| 'unavailable' \| 'unknown'` — denormalised cache                                                                |
| `status_updated_at` | TEXT NOT NULL | ISO-8601                                                                                                                      |
| `origin`            | TEXT NOT NULL | `'internal'` (bootstrap path) or `'external'` (HTTP drop-in). Default `internal`                                              |
| `api_key_hash`      | TEXT NULL     | Historical column; new external rows write `null` (trust model is the network)                                                |
| `evicted_at`        | TEXT NULL     | Wall-clock of a hard-eviction by the external-registry ticker                                                                 |
| `capabilities_json` | TEXT NULL     | Latest self-reported `<capabilityKey> → boolean` snapshot; `null` if none                                                     |

Indexes: `idx_pillar_registry_status` on `status`, `idx_pillar_registry_origin` on `origin`.

Migrations live in `pillars/registry/migrations/` (`0055_pillar_registry.sql` creates the table + status index; `0058` adds `origin`/`api_key_hash`/`evicted_at` + origin index; `0068` adds `capabilities_json`).

### Persisted-registration shape

The DB service projects rows onto `PillarRegistration` (`registry/src/db/services/pillar-registry.ts`): every column plus the parsed manifest blob. `registeredAt` is `INSERT ... ON CONFLICT DO UPDATE` with the column omitted from the update set, so it survives re-registration; everything else is overwritten from `excluded.*`.

### Wire shape — `RegistryEntry`

The snapshot/subscribe routes project each row onto the public wire entry (`registry/src/api/modules/registry/types.ts`):

```ts
type RegistryEntry = {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload; // re-parsed from manifest_json
  contract: { package: string; version: string; tag: string };
  registeredAt: string;
  lastHeartbeatAt: string;
  status: 'healthy' | 'unavailable' | 'unknown';
  statusUpdatedAt: string;
  capabilities?: Record<string, boolean>; // omitted when the row reported none
};

type RegistrySnapshot = { pillars: RegistryEntry[]; fetchedAt: string };
```

## REST surface

All routes are served by the registry pillar on `:3001`. During the dotted-→-slash rolling-deploy window every operation is **dual-served**: mounted on the canonical slash path AND on a legacy dotted alias, both pointing at the same handler instance. A pass-through metric fires only on the dotted alias so the aliases can be dropped once the legacy-path-hit count reads zero everywhere. Path strings are owned by `@pops/pillar-sdk` (`REGISTRY_PATHS`, `LEGACY_REGISTRY_PATHS`).

| Operation  | Canonical (slash)      | Legacy (dotted)             | Method | Public via shell nginx?                 |
| ---------- | ---------------------- | --------------------------- | ------ | --------------------------------------- |
| register   | `/registry/register`   | `/core.registry.register`   | POST   | No                                      |
| heartbeat  | `/registry/heartbeat`  | `/core.registry.heartbeat`  | POST   | No                                      |
| deregister | `/registry/deregister` | `/core.registry.deregister` | POST   | No                                      |
| snapshot   | `/registry/pillars`    | `/core.registry.list`       | GET    | Yes (read-only, via shell's `/pillars`) |
| subscribe  | `/registry/subscribe`  | — (slash only)              | GET    | Yes (SSE, read-only)                    |

### `POST /registry/register`

Body: `{ pillarId: string; baseUrl: string; manifest: ManifestPayload; capabilities?: Record<string, boolean> }`.

1. Parse the body shape. Non-object body, missing/empty `pillarId`, invalid-URL `baseUrl`, missing `manifest`, or a malformed `capabilities` record → `400 { ok: false, issues: ValidationIssue[] }`.
2. Reject a `pillarId` that fails `^[a-z][a-z0-9-]*$` → `400` with a `pillarId` issue.
3. Validate `manifest` against the shared manifest validator. On failure → `400` with the per-field issues.
4. Cross-field: `manifest.pillar` must equal `pillarId` → else `400` with a `manifest.pillar` issue. (The manifest validator separately enforces `contract.package` ↔ pillar and `contract.tag === contract-<pillar>@v<version>`.)
5. UPSERT into `pillar_registry`: `registered_at` set on INSERT only; `last_heartbeat_at`, `status = 'healthy'`, `status_updated_at`, and `capabilities_json` written from the request. The HTTP route passes `origin = 'external'`, `apiKeyHash = null`; the in-tree bootstrap path defaults `origin = 'internal'`.
6. Emit a `registered` event on the in-process bus.

Response: `200 { ok: true; pillarId; registeredAt; heartbeatIntervalMs }`.

### `POST /registry/heartbeat`

Body: `{ pillarId: string; capabilities?: Record<string, boolean> }`.

1. Parse + validate the body → `400` on malformed shape.
2. Look up the row. If absent → `200 { ok: false, reason: 'not-registered' }` (a soft signal, **not** a 404 — the SDK re-registers without parsing status codes).
3. Update `last_heartbeat_at = now`, reset `status = 'healthy'`, rewrite `status_updated_at` **only on a transition**, and overwrite `capabilities_json` only when `capabilities` is present.
4. If the status flipped (e.g. `unavailable → healthy`), emit a `health-changed` event.

Response: `200 { ok: true; pillarId; lastHeartbeatAt; status; statusChanged }` or `200 { ok: false; reason: 'not-registered' }`.

### `POST /registry/deregister`

Body: `{ pillarId: string }`.

1. Parse → `400` on malformed shape.
2. No row → `200 { ok: true, removed: false }` (idempotent; no event).
3. Row with `origin = 'internal'` → `403 { ok: false, reason: 'internal-pillar-not-deregisterable-externally' }`. An in-network caller cannot nuke an in-tree pillar by accident.
4. Otherwise hard `DELETE` and emit `deregistered` with `reason: 'requested'`.

Response: `200 { ok: true; removed: boolean }` or `403`.

### `GET /registry/pillars` (snapshot, public)

`SELECT * FROM pillar_registry ORDER BY pillar_id`, re-parse each `manifest_json`, project to `RegistryEntry[]`, and compute **live status** off `last_heartbeat_at` at read time (so consumers see the freshest state even if the background ticker lags). Returns the bare `{ pillars, fetchedAt }` object — no envelope. `unknown` rows stay `unknown` (only the reconciliation path sets that); everything else resolves to `healthy`/`unavailable` from heartbeat age.

### `GET /registry/subscribe` (SSE, public)

Plain Express `text/event-stream` route (not a tRPC subscription — tRPC subscriptions need a WebSocket; SSE is plain HTTP). On connect it writes a `pillar.snapshot` frame with the current `RegistryEntry[]`, then forwards every `registered` / `deregistered` / `health-changed` payload as a discrete `pillar.<event>` frame off the in-process bus. On `close` it unsubscribes so a flaky client cannot leak listeners. Buffering is disabled (`X-Accel-Buffering: no`).

### Event bus

A singleton in-process `EventEmitter` (`registry/event-bus.ts`). Mutating routes publish; the SSE handler is the consumer. Payload: `{ event, pillarId, entry, emittedAt, origin?, reason?, evictedAt? }`. No sequence numbers, no cross-process distribution, no server-side filtering — multi-process scaling is out of scope.

### nginx exposure (shell)

The public shell nginx (`pillars/shell/nginx.conf`) proxies the read-only surface to `http://registry-api:3001` — the boot snapshot at `/pillars` (the path the shell's `fetchPillarRegistry` reads), the aggregated `/pillars/health` probe, and the SSE stream at `/registry/subscribe` — and **does not mount the mutating routes at all**. Registration runs entirely inside the docker network, where each pillar POSTs directly to the registry over the compose bridge. With no public location for `/registry/{register,heartbeat,deregister}`, those paths fall through to the default `location /` and never reach the registry from outside.

> This is the corrected exposure model. The original spec proposed an explicit `return 403` block; the shipped shell instead omits the public location entirely (implicit deny), which closes the same external path more cleanly. Internal callers reach the mutating routes directly, bypassing nginx.

## Business rules

- **One row per pillar.** Re-registration overwrites; no history, no audit log.
- **`registered_at` is INSERT-only.** Re-registers (e.g. after a pillar restart) preserve the original timestamp.
- **`last_heartbeat_at` updates on every successful register + heartbeat.** Drives the missed-heartbeat → `unavailable` computation.
- **Live status is computed, not trusted from the column.** Every snapshot/subscribe read recomputes status from `last_heartbeat_at`; the persisted column only drives the background ticker's transition emission.
- **Manifest validation runs at the route boundary.** The shared `validateManifestPayload` runs on every register. 400 responses carry the per-field `issues` array. Cross-field checks (`manifest.pillar` ↔ `pillarId`, `contract.package` ↔ pillar, `contract.tag` ↔ version) run after structural validation.
- **`baseUrl` is pillar-provided and trusted.** No active probing of the URL at register time — the heartbeat lifecycle handles liveness.
- **Heartbeat on an unregistered pillar returns `{ ok: false, reason: 'not-registered' }` with a 200**, not a 404, so the SDK detects it cleanly and re-registers.
- **Deregister is idempotent** for a missing row and **refuses `origin = 'internal'` rows** with a 403.
- **Every mutating route emits a bus event.** The SSE stream forwards them; the transport contract is the subscription-model PRD's job.
- **No rate limiting, no replay protection, no TLS/mTLS.** Single-host single-user; the docker network + nginx exposure are the trust boundary (ADR-027). The registry is not a security boundary.

## Edge cases

| Case                                                       | Behaviour                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest fails validation                                  | `400` with per-field issues; SDK surfaces them.                                                                                                           |
| Mismatched `pillarId` / `manifest.pillar` (or package/tag) | `400` with the cross-field issue.                                                                                                                         |
| Register twice in quick succession (boot race)             | UPSERT; second wins. `registered_at` preserved from the first; rest overwritten.                                                                          |
| Heartbeat races a deregister                               | Heartbeat sees the DELETE, updates 0 rows, returns `not-registered`; SDK re-registers. Final state matches reality.                                       |
| Snapshot read mid-mutation                                 | SQLite snapshot isolation returns a consistent point-in-time view.                                                                                        |
| External register reaches the public shell                 | No public location for the mutating routes; the request falls through to `location /` and never hits the registry.                                        |
| `internal` pillar targeted by an external deregister       | `403 internal-pillar-not-deregisterable-externally`; row untouched.                                                                                       |
| `manifest_json` invalid after a schema change              | Snapshot re-parse fails on read for that row; mitigated by coordinated SDK + registry deploys.                                                            |
| Registry restarts; rows persist                            | Status reconciliation (reconciliation-on-restart PRD) sets `unknown` until each pillar re-registers.                                                      |
| `pillar_registry` empties (DB loss)                        | Pillars reappear on their next heartbeat (gets `not-registered` → re-register). Recovery ≈ heartbeat interval.                                            |
| `base_url` points nowhere                                  | Heartbeat still works (pillar → registry; `baseUrl` unused). Snapshot returns the stale URL; consumers calling it get connection-refused. Operator's job. |

## Acceptance criteria

- [x] `pillar_registry` table + status index created by migration; `origin`/`api_key_hash`/`evicted_at` (+ origin index) and `capabilities_json` added by follow-up migrations.
- [x] `register` validates body shape, `pillarId` pattern, manifest payload, and `pillarId ↔ manifest.pillar`; returns `400 { ok:false, issues }` on any failure.
- [x] `register` UPSERTs with `registered_at` preserved on conflict and `status = 'healthy'`; responds `{ ok:true, pillarId, registeredAt, heartbeatIntervalMs }` and emits a `registered` event.
- [x] `heartbeat` updates `last_heartbeat_at` + resets `status`, rewrites `status_updated_at` only on transition, emits `health-changed` on a flip, and returns `{ ok:false, reason:'not-registered' }` (200) for an unknown pillar.
- [x] `deregister` is idempotent (`removed:false` on a missing row, no event), hard-DELETEs `external` rows with a `deregistered`/`requested` event, and refuses `internal` rows with a 403.
- [x] `snapshot` returns the bare `{ pillars, fetchedAt }` shape with live status computed from `last_heartbeat_at` at read time.
- [x] `subscribe` is a plain SSE stream that emits an initial `pillar.snapshot` frame, forwards bus events as `pillar.<event>` frames, and unsubscribes on connection close.
- [x] An in-process event bus is published to by every mutating route and consumed by the SSE handler.
- [x] Each operation is dual-served on its canonical slash path and legacy dotted alias via the same handler, with a metric that fires only on the dotted alias.
- [x] The shell nginx proxies the read-only snapshot (`/pillars`), `/pillars/health`, and the SSE stream (`/registry/subscribe`), and does not expose the mutating routes publicly.

## Out of scope

- Heartbeat TTL math + missed-heartbeat detection — heartbeat-lifecycle PRD.
- SSE transport contract + client reconnect/backoff — subscription-model PRD.
- Restart reconciliation (`unknown` status assignment) — reconciliation-on-restart PRD.
- External-pillar drop-in registration flow + the hard-eviction ticker for stale `external` rows — external-registry PRD.
- Per-route ACL/scopes, rate limiting, TLS/mTLS, replay nonces — the docker network + nginx exposure are the boundary.
- Multi-instance pillar registration (HA), soft-delete/archival, backup/restore, cross-host federation — single-host, single-instance-per-pillar operating assumption.
  </content>
  </invoke>
