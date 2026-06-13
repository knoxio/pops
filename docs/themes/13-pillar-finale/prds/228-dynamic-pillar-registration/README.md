# PRD-228: Dynamic pillar registration (external-pillar drop-in)

> Epic: [Central registry](../../epics/02-central-registry.md)

> Status: Not started

## Overview

PRD-217's nginx generator wires the dispatcher to the static `PILLARS` constant
exported by the pillar SDK. That works for in-tree pillars and only those —
adding a pillar shipped from a different repository still requires editing the
constant and rebuilding `pops-shell`. PRD-228 closes that gap: it makes the
registry (PRD-161 + 162) the single source of truth for which pillars exist,
exposes a runtime register / heartbeat / deregister API that external services
can call with a shared internal key, and wires the nginx generator to read from
the registry snapshot on every registration event instead of from a compile-time
constant. End-to-end deliverable: drop a containerised pillar onto the same
docker network, point it at `core-api`, give it the shared key — it appears in
the dispatcher and starts serving traffic with no code change in `pops/`.

This is the final BE-lego unblock for external pillars. Implementation is
deferred; this PR is documentation only.

## Data Model

### Extensions to `core.db.pillar_registry` (PRD-161)

PRD-161 already provisions the table. PRD-228 adds three columns:

```sql
ALTER TABLE pillar_registry
  ADD COLUMN origin         TEXT NOT NULL DEFAULT 'internal'; -- 'internal' | 'external'
ALTER TABLE pillar_registry
  ADD COLUMN api_key_hash   TEXT;                              -- SHA-256 of the key used to register; NULL for 'internal'
ALTER TABLE pillar_registry
  ADD COLUMN evicted_at     TEXT;                              -- ISO8601; set when ticker evicts a never-heartbeating registration

CREATE INDEX idx_pillar_registry_origin ON pillar_registry(origin);
```

| Column         | Purpose                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`       | `'internal'` for in-tree pillars (bootstrapPillar path, PRD-158); `'external'` for pillars that registered via the shared-key HTTP endpoint.        |
| `api_key_hash` | SHA-256 of the `POPS_INTERNAL_API_KEY` value at registration time. Lets a key rotation deregister stale external pillars without touching internal. |
| `evicted_at`   | Set by the ticker when an external pillar registers but never heartbeats within the grace window. Distinguishes eviction from clean deregister.     |

No new tables. The registry stays one row per pillar.

### Migration

`packages/core-db/migrations/00YY_pillar_registry_external_origin.sql` — adds
the three columns + index. Existing rows backfill to `origin = 'internal'`,
`api_key_hash = NULL`, `evicted_at = NULL`.

## API Surface

PRD-161 ships the `core.registry.*` tRPC procedures over the in-network
boundary, gated by nginx. PRD-228 adds a **public-but-key-gated HTTP surface**
specifically for external services. Two layers, one persistence:

### HTTP endpoints on `pops-core-api` (exposed through nginx)

#### `POST /core.registry.register`

Request:

```ts
{
  pillarId: string; // e.g. 'recipes'
  baseUrl: string; // 'http://recipes-api:4010' — reachable from inside the docker network
  manifest: ManifestPayload; // validated by PRD-157
  apiKey: string; // must match POPS_INTERNAL_API_KEY
}
```

Behaviour:

1. Constant-time compare `apiKey` against `POPS_INTERNAL_API_KEY`. Mismatch → 401.
2. Validate `manifest` per PRD-157. Failure → 400 with per-field issues.
3. Cross-field: `manifest.pillar === pillarId`. Mismatch → 400.
4. UPSERT into `pillar_registry` with `origin = 'external'`, `api_key_hash = sha256(apiKey)`, `evicted_at = NULL`, status `healthy`. Re-registration preserves the original `registered_at`.
5. Emit subscription event `{ type: 'registered', pillarId, manifest, origin: 'external' }`.
6. Trigger nginx regeneration (see Business Rules — nginx regen).

Response: `{ ok: true, pillarId, registeredAt: string, heartbeatIntervalMs: 10000 }`.

#### `POST /core.registry.heartbeat`

Request: `{ pillarId: string; apiKey: string }`.

Behaviour:

1. Constant-time compare `apiKey`. Mismatch → 401.
2. Verify the pillar row's `api_key_hash` matches `sha256(apiKey)`. Mismatch → 401 (a rotated key invalidates old registrations).
3. UPDATE `last_heartbeat_at = NOW()`. If 0 rows → `{ ok: false, reason: 'not-registered' }` (external SDK re-runs register).
4. PRD-162's lifecycle handles `unavailable → healthy` transition + event emission.

Response: `{ ok: true, lastHeartbeatAt: string } | { ok: false, reason: 'not-registered' }`.

#### `POST /core.registry.deregister`

Request: `{ pillarId: string; apiKey: string }`.

Behaviour:

1. Constant-time compare `apiKey`. Mismatch → 401.
2. Verify the pillar row's `api_key_hash` matches. Mismatch → 401.
3. DELETE the row.
4. Emit `{ type: 'deregistered', pillarId, origin: 'external' }`.
5. Trigger nginx regeneration.

Response: `{ ok: true }` (idempotent).

### nginx dispatcher rules

The block introduced by PRD-161 stays — internal mutating calls to
`/trpc/core.registry.(register|heartbeat|deregister)` continue to be blocked
from external traffic. The PRD-228 endpoints live at a **different path prefix**
(`/core.registry.*`, no `/trpc/` prefix, served as plain HTTP-JSON by core-api)
and are explicitly allow-listed:

```nginx
location ~ ^/core\.registry\.(register|heartbeat|deregister)$ {
    proxy_pass http://core-api:3001;
    # standard proxy headers
}
```

The internal `/trpc/core.registry.*` surface and the external
`/core.registry.*` surface call the same underlying persistence layer.

### nginx generator hook

PRD-217's generator becomes registry-driven:

- Input: `core.registry.snapshot()` output.
- Triggered on `registered`, `deregistered`, and `health-changed (→ unavailable
via eviction)` events.
- Process: regenerate `default.conf` from the snapshot → `nginx -t` validate →
  on pass, `nginx -s reload`; on fail, log + keep current conf.

Concrete trigger surface lives in PRD-217's updated scope; PRD-228 specifies the
**contract**: every successful register / deregister / eviction MUST result in
the nginx generator running. Implementation choice (subscription listener vs
post-mutation hook) is deferred to implementation.

## Business Rules

- **Auth is a single shared key, not per-pillar.** `POPS_INTERNAL_API_KEY` is
  the only credential. ADR-027 already treats the docker network as the trust
  boundary; the key exists so an external service running outside the host
  cannot accidentally register.
- **Constant-time comparison only.** Use `crypto.timingSafeEqual` on the raw
  bytes; never `===`. Both string comparisons (`apiKey === stored`) and naive
  `Buffer.compare` are timing-attack surfaces.
- **Key rotation evicts external registrations.** A rotated key means the
  hashed `api_key_hash` no longer matches incoming heartbeats; those pillars
  flip to `not-registered` and must re-register with the new key. Internal
  pillars (`origin = 'internal'`, `api_key_hash = NULL`) are unaffected.
- **Heartbeat cadence is 10s** (matches PRD-162's internal cadence). The
  registration response includes `heartbeatIntervalMs` so the external SDK
  doesn't hard-code it; the registry can lengthen this in the future without a
  client-side change.
- **Eviction policy.** PRD-162's miss-threshold (3 × 10s = 30s) flips a pillar
  to `unavailable`. PRD-228 adds a **hard-eviction** for external pillars: if
  `origin = 'external'` AND `status = 'unavailable'` for >5 minutes, the row is
  DELETEd, `evicted_at` is recorded in the subscription event, and the nginx
  generator is re-run. Internal pillars are never hard-evicted (they're
  expected to come back when the container restarts).
- **nginx regen is debounced.** Multiple registrations in a short window
  collapse to a single regen + reload (250ms debounce). Prevents a thundering
  herd at core-api startup or during a multi-pillar deploy.
- **nginx regen is idempotent and validated.** Same registry snapshot → same
  `default.conf`. `nginx -t` always runs before reload. A regen that fails
  validation logs at error level and leaves the current conf in place; the
  registry still records the registration (degraded mode: registry knows about
  the pillar, dispatcher doesn't yet).
- **External pillars cannot register as core pillars.** `pillarId` matching one
  of the in-tree pillar ids (`finance`, `media`, `inventory`, `cerebrum`,
  `core`, `food`, `lists`) is rejected with 409. Prevents accidental shadowing.
- **No multi-instance.** One row per `pillarId`; second registration overwrites.
  Matches PRD-161's single-instance assumption.
- **Manifest changes between registrations regenerate nginx.** The dispatcher
  block per pillar depends only on `baseUrl` today, but future enhancements
  (per-pillar timeouts, websocket upgrades) may key off manifest fields; the
  generator MUST re-run on every register so a no-op snapshot diff is harmless
  but a real change is never missed.

## Edge Cases

| Case                                                            | Behaviour                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External pillar registers but never sends a heartbeat           | 30s after registration the lifecycle ticker flips it to `unavailable`. 5 minutes later the eviction ticker DELETEs the row + regenerates nginx. Subscription event includes `evicted_at` and `reason: 'never-heartbeated'`.           |
| External pillar registers with a stale (rotated) key            | Registration uses whatever key is currently set in env, so success — but its heartbeat fails 401 because the heartbeat path validates `api_key_hash` against the current key. The pillar must re-register; SDK handles the 401.       |
| Duplicate registration (same pillarId, same baseUrl, same key)  | UPSERT no-op semantics: `last_heartbeat_at` updated, manifest fields refreshed, `registered_at` preserved, no subscription event if the manifest is bytewise identical. nginx regen still triggered (debounced).                      |
| Duplicate registration with different `baseUrl`                 | UPSERT overwrites. Subscription event fires. nginx regen runs and the dispatcher block now points at the new URL. The old URL stops receiving traffic on the next reload.                                                             |
| Two external pillars race the same `pillarId`                   | SQLite serialises writes; whichever lands last wins. The loser's heartbeats start failing with `not-registered`. Operational misconfig; not the registry's job to mediate.                                                            |
| External pillar registers during core-api boot reconciliation   | PRD-164's reconciliation sets all rows to `unknown` on startup. A register call coming in during reconciliation lands a fresh `healthy` row and an event. Reconciliation completes around it without overwriting.                     |
| External pillar tries to register as `finance` / `media` / etc. | 409 with `reason: 'pillar-id-reserved'`. The reserved list is the static in-tree `PILLARS` set at the time core-api was built.                                                                                                        |
| Key rotation mid-flight (env var swap)                          | Internal pillars (`origin = 'internal'`) are unaffected — no key check. External pillars start getting 401 on heartbeat; they re-register with the new key. Brief window of `unavailable` in the dispatcher until reload settles.     |
| nginx generator throws / `nginx -t` rejects the output          | Registration still completes (registry is the source of truth). Generator error is logged. Current `default.conf` stays in place. Next successful generation catches up. Health endpoint exposes `nginx_generator_last_error_at`.     |
| External pillar deregisters while heartbeat is in flight        | Deregister DELETEs the row; the in-flight heartbeat lands on a row that's gone and returns `{ ok: false, reason: 'not-registered' }`. SDK on the external side stops sending heartbeats (it's mid-shutdown anyway).                   |
| Subscription bus is down when registration succeeds             | Registration persists. Event emit failure is logged. nginx regen also runs off the event bus, so the regen is skipped; the next register / deregister catches up. PRD-163's recovery semantics apply.                                 |
| External pillar registers with a `baseUrl` core-api can't reach | Registration succeeds (no probe at registration time). nginx forwards traffic to a connection-refused upstream; clients see 502. Operator must fix the URL or deregister. Documented; not the registry's job to validate liveness.    |
| Manifest schema bumps between SDK versions                      | If an external pillar registers with a manifest that's valid for an older schema, PRD-157's validator rejects it. ADR-031's coordinated-deploy guidance applies; external pillars track the published `@pops/pillar-contract` semver. |

## User Stories

| #   | Story                                                                   | Summary                                                                                                                                   | Parallelisable                       |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 01  | [us-01-register-endpoint](us-01-register-endpoint.md)                   | Schema migration + `POST /core.registry.register` endpoint with key auth, manifest validation, UPSERT, and reserved-pillar-id rejection.  | yes — independent                    |
| 02  | [us-02-heartbeat-endpoint](us-02-heartbeat-endpoint.md)                 | `POST /core.registry.heartbeat` with key-hash verification, `not-registered` response path, and hard-eviction ticker for stale externals. | blocked by us-01                     |
| 03  | [us-03-nginx-regen-integration](us-03-nginx-regen-integration.md)       | Wire the PRD-217 generator to registry events (register / deregister / evict); debounced regen + `nginx -t` + reload.                     | blocked by us-01 + PRD-217 generator |
| 04  | [us-04-deregister-endpoint](us-04-deregister-endpoint.md)               | `POST /core.registry.deregister` with key-hash verification, idempotent DELETE, and nginx regen trigger.                                  | blocked by us-01                     |
| 05  | [us-05-e2e-external-pillar-dropin](us-05-e2e-external-pillar-dropin.md) | End-to-end test: spin up a throwaway pillar container, register via the HTTP endpoint, hit it through the shell dispatcher, deregister.   | blocked by us-01..04                 |

Status: all user stories done. US-03's deferred ACs (explicit
`nginx -t` gating, `nginx_generator_last_error_at` health surface,
register/deregister end-to-end watcher tests) land in the follow-up
shipping `nginx-generator-health.ts` and the watcher e2e harness.

## Out of Scope

- Per-pillar API keys / scoped tokens. ADR-027's trust model is a single shared
  key. If multi-tenant external pillars become a real use case, write a new ADR.
- Active liveness probing of `baseUrl` at registration time. Heartbeat is the
  liveness signal; trusting the pillar at registration matches PRD-161.
- TLS / mTLS between external pillars and core-api. Docker network remains the
  trust boundary; external pillars must run on the same network.
- A discovery UI / admin console for listing external pillars. The
  `core.registry.snapshot` endpoint already exposes the data; UI is a separate
  PRD if anyone wants it.
- Versioned compatibility checks (e.g. "external pillar contract is too new for
  this core-api"). ADR-031's coordinated-deploy guidance covers this without
  bespoke handshake logic.
- Multi-instance pillar registration (HA). One row per pillarId, last write
  wins. Inherits PRD-161's stance.
- Soft delete or audit history of registration events. The subscription stream
  (PRD-163) is the audit trail; consumers tail it if they need history.
- Rate limiting on the register / heartbeat endpoints. Single-host single-user
  with a shared key in a docker network; not a realistic abuse surface.
