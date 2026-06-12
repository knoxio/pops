# PRD-161: Registry schema + endpoints

> Epic: [Central registry](../../epics/02-central-registry.md)

## Overview

The runtime registry's data layer and HTTP surface on `pops-core-api`. One table — `core.db.pillar_registry` — with one row per pillar. Five tRPC procedures: `register`, `heartbeat`, `deregister`, `snapshot`, `subscribe`. Authentication is enforced at the **nginx dispatcher level**: mutating procedures (`register`, `heartbeat`, `deregister`) are blocked from external traffic; reads (`snapshot`, `subscribe`) are exposed externally for debugging. Inside the docker network, zero auth-check overhead — pillars POST their manifest and the registry trusts the source IP.

This PRD ships the data + endpoint primitives. Lifecycle behaviour (heartbeat TTL, missed-heartbeat detection, reconciliation on restart) lives in PRDs 162 + 164. Subscription transport details live in PRD-163.

## Data Model

### `core.db.pillar_registry`

```sql
CREATE TABLE pillar_registry (
  pillar_id          TEXT PRIMARY KEY,                          -- 'finance', 'media', ...
  base_url           TEXT NOT NULL,                              -- 'http://finance-api:3004'
  manifest_json      TEXT NOT NULL,                              -- JSON blob; the ManifestPayload (PRD-157)
  contract_package   TEXT NOT NULL,                              -- '@pops/finance-contract'
  contract_version   TEXT NOT NULL,                              -- '1.4.2'
  contract_tag       TEXT NOT NULL,                              -- 'contract-finance@v1.4.2'
  registered_at      TEXT NOT NULL,                              -- ISO8601; first register OR re-register
  last_heartbeat_at  TEXT NOT NULL,                              -- ISO8601; most recent heartbeat success
  status             TEXT NOT NULL,                              -- 'healthy' | 'unavailable' | 'unknown'
  status_updated_at  TEXT NOT NULL                               -- ISO8601
);

CREATE INDEX idx_pillar_registry_status ON pillar_registry(status);
```

Status is recomputed by PRD-162's heartbeat logic; this PRD only ships the persistence.

### Migration

`packages/core-db/migrations/00XX_pillar_registry.sql` — adds the table + index.

## API Surface

### tRPC procedures (all under `core.registry.*` namespace, served by pops-core-api)

#### `core.registry.register` (mutation, internal-only)

Input:

```ts
{
  baseUrl: string; // 'http://finance-api:3004'
  manifest: ManifestPayload; // validated by PRD-157
}
```

Behaviour:

1. Validate `manifest` against `ManifestPayloadSchema` (PRD-157). On failure → 400 with per-field issues.
2. Verify `manifest.pillar` matches the source — read the IP/hostname; if it doesn't resolve to the claimed pillar's container, log a warning (don't reject; nginx is the trusted gatekeeper).
3. UPSERT into `pillar_registry`:
   - `pillar_id = manifest.pillar`
   - All other fields populated from manifest
   - `registered_at = NOW()` only if INSERT; preserved on UPDATE (use `INSERT ... ON CONFLICT DO UPDATE` with conditional)
   - `last_heartbeat_at = NOW()`
   - `status = 'healthy'`
   - `status_updated_at = NOW()`
4. Emit a subscription event (PRD-163): `{ type: 'registered', pillarId, manifest }`.

Output: `{ ok: true, pillarId: string, registeredAt: string }`.

#### `core.registry.heartbeat` (mutation, internal-only)

Input:

```ts
{
  pillarId: string;
}
```

Behaviour:

1. UPDATE `pillar_registry SET last_heartbeat_at = NOW(), status = 'healthy', status_updated_at = NOW() WHERE pillar_id = ?`.
2. If 0 rows updated (pillar isn't registered) → return `{ ok: false, reason: 'not-registered' }`. SDK responds by re-running the register flow (PRD-158's heartbeat error path).
3. If status changed from `unavailable` → `healthy`, emit subscription event `{ type: 'health-changed', pillarId, status: 'healthy' }`.

Output: `{ ok: true, lastHeartbeatAt: string } | { ok: false, reason: 'not-registered' }`.

#### `core.registry.deregister` (mutation, internal-only)

Input:

```ts
{
  pillarId: string;
}
```

Behaviour:

1. DELETE FROM `pillar_registry` WHERE `pillar_id = ?`.
2. Emit subscription event `{ type: 'deregistered', pillarId }`.

Output: `{ ok: true }` (idempotent; no error if pillar wasn't registered).

#### `core.registry.snapshot` (query, **public**)

Input: none.

Behaviour:

1. `SELECT * FROM pillar_registry`.
2. Parse `manifest_json` back into `ManifestPayload`.
3. Return as `RegistrySnapshot` shape (per PRD-159).

Output:

```ts
{
  pillars: Array<{
    pillarId: string;
    baseUrl: string;
    manifest: ManifestPayload;
    registered: true; // always; deregistered pillars are removed from the table
    lastSeenAt: string;
    status: 'healthy' | 'unavailable' | 'unknown';
  }>;
  fetchedAt: string;
}
```

#### `core.registry.subscribe` (subscription, **public**)

SSE channel; details in PRD-163.

### nginx dispatcher rules (added to `apps/pops-shell/nginx.conf`)

```nginx
# Block mutating registry calls from external traffic
location ~ ^/trpc/core\.registry\.(register|heartbeat|deregister)$ {
    return 403;
}

# Allow snapshot + subscribe (read-only) through to core-api
location ~ ^/trpc/core\.registry\.(snapshot|subscribe)$ {
    set $core_registry_upstream http://core-api:3001;
    proxy_pass $core_registry_upstream;
    # ... standard proxy headers
}
```

Inside the docker network, pillars hit `http://core-api:3001/trpc/core.registry.register` directly without going through nginx. The nginx 403 only fires for external traffic.

## Business Rules

- **One row per pillar.** Re-registration overwrites. No history table; no audit log.
- **`registered_at` is set on first INSERT only.** Re-registers (e.g. after pillar restart) preserve the original timestamp. Useful for "how long has this pillar been alive?" questions.
- **`last_heartbeat_at` updates on every successful heartbeat.** Drives PRD-162's missed-heartbeat detection.
- **Validation runs at the endpoint boundary.** PRD-157's `validateManifestPayload` is called on every `register` POST. 400 responses include the per-field issues array.
- **Cross-field validation runs after structural.** `manifest.pillar` must match `manifest.contract.package`'s pillar (e.g. `finance` ↔ `@pops/finance-contract`). Caught by PRD-157.
- **The `baseUrl` is provided by the pillar at registration time.** The pillar knows where it's listening (port + hostname); the registry trusts it. No active discovery (probing the URL) — the heartbeat lifecycle handles liveness.
- **Status starts as `'healthy'` on register.** Transitions to `'unavailable'` after missed heartbeats (PRD-162). Transitions to `'unknown'` only after core-api restart reconciliation (PRD-164).
- **Subscription events are emitted by every mutating procedure.** PRD-163 specifies the transport; this PRD specifies that events fire.
- **No request rate limiting in V1.** Single-host single-user; thundering herd isn't realistic. If load testing surfaces issues, revisit.
- **No replay protection / nonces.** The registry isn't a security boundary; the docker network + nginx config are.
- **Deregister is idempotent.** Calling it for a pillar that was never registered is a no-op; returns `{ ok: true }`.
- **Heartbeat for an unregistered pillar returns `{ ok: false, reason: 'not-registered' }` rather than 404.** Lets the SDK detect this condition cleanly and re-register without exception handling.

## Edge Cases

| Case                                                                                           | Behaviour                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar registers with a manifest that fails Zod validation                                     | 400 with per-field issues. SDK crashes with the issues.                                                                                                                                                                   |
| Pillar registers with mismatched contract package + pillar id (cross-field)                    | Same — 400 with cross-field issue.                                                                                                                                                                                        |
| Pillar registers twice in quick succession (race condition during boot)                        | UPSERT semantics handle this; the second registration wins. `registered_at` preserved from the first; everything else updated.                                                                                            |
| Pillar registers with the same manifest as before (no real change)                             | UPSERT runs; trivial overhead. No subscription event emitted if the manifest is bytewise identical to what was already stored.                                                                                            |
| Heartbeat arrives during deregister                                                            | Race-window risk: heartbeat sees the DELETE happen and updates 0 rows; returns `not-registered`. SDK re-registers. Acceptable; the registry's final state matches reality.                                                |
| Deregister for a pillar that's currently `unavailable`                                         | DELETE runs; subscription event emitted; returns ok.                                                                                                                                                                      |
| Snapshot request arrives mid-mutation                                                          | SQLite's snapshot isolation handles read consistency; SELECT returns a consistent point-in-time view.                                                                                                                     |
| Snapshot table has 30+ pillars                                                                 | Response is a few KB of JSON. Fine.                                                                                                                                                                                       |
| External attacker hits `/trpc/core.registry.register`                                          | nginx returns 403 before reaching core-api. Logged in nginx access log.                                                                                                                                                   |
| Internal pillar can't reach core-api for register (e.g. transient network hiccup)              | SDK retries with exponential backoff per PRD-158. Registry never sees the failed attempt.                                                                                                                                 |
| `manifest_json` becomes invalid after a schema change (e.g. SDK upgrade adds a required field) | snapshot/subscribe reads the row; the SDK on the consumer side tries to validate and fails. Operationally rare; mitigated by coordinated SDK + registry deploys per ADR-031.                                              |
| Core-api restarts; rows persist                                                                | Status reset to `'unknown'` (PRD-164's reconciliation logic). Consumers see `'unknown'` until each pillar re-registers or a deadline passes.                                                                              |
| Concurrent deregister + heartbeat for the same pillar                                          | SQLite serialises writes; whichever lands last wins. Either is acceptable.                                                                                                                                                |
| `core.db` corrupts and the `pillar_registry` table is empty                                    | All pillars reappear on their next heartbeat (which gets `not-registered`, triggering re-registration). Recovery time: heartbeat interval × however many pillars.                                                         |
| Pillar provides a `baseUrl` that doesn't actually serve the pillar                             | Heartbeat works (it comes from the pillar to the registry; baseUrl unused). Snapshot returns the stale baseUrl. Consumers calling the pillar via the baseUrl get connection-refused. Operator's job to fix the misconfig. |

## User Stories

| #   | Story                                                           | Summary                                                                                                              | Parallelisable                     |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 01  | [us-01-migration](us-01-migration.md)                           | `core-db` migration adding `pillar_registry` table + index                                                           | yes — independent                  |
| 02  | [us-02-tRPC-router-scaffold](us-02-tRPC-router-scaffold.md)     | `core.registry.*` router skeleton with empty procedure stubs                                                         | blocked by us-01                   |
| 03  | [us-03-register-procedure](us-03-register-procedure.md)         | Implement `register` mutation with PRD-157 validation + UPSERT                                                       | blocked by us-02                   |
| 04  | [us-04-heartbeat-procedure](us-04-heartbeat-procedure.md)       | Implement `heartbeat` mutation + `not-registered` response path                                                      | blocked by us-02                   |
| 05  | [us-05-deregister-procedure](us-05-deregister-procedure.md)     | Implement `deregister` mutation; idempotent semantics                                                                | blocked by us-02                   |
| 06  | [us-06-snapshot-procedure](us-06-snapshot-procedure.md)         | Implement `snapshot` query with JSON parse + RegistrySnapshot shape                                                  | blocked by us-02                   |
| 07  | [us-07-event-emitter-hook](us-07-event-emitter-hook.md)         | A subscription event channel that mutating procedures publish to; consumed by PRD-163                                | blocked by us-03 + us-04 + us-05   |
| 08  | [us-08-nginx-dispatcher-rules](us-08-nginx-dispatcher-rules.md) | Add the 403-block for mutating registry calls + allow-through for snapshot/subscribe in `apps/pops-shell/nginx.conf` | yes — independent of core-api work |
| 09  | [us-09-integration-tests](us-09-integration-tests.md)           | Round-trip tests: SDK registers → snapshot reflects it → heartbeat updates timestamp → deregister removes the row    | blocked by us-03..06               |
| 10  | [us-10-external-block-tests](us-10-external-block-tests.md)     | Verify external requests to mutating endpoints get 403 (nginx isolation)                                             | blocked by us-08                   |

## Out of Scope

- Heartbeat TTL + missed-heartbeat detection: PRD-162.
- Subscription transport (SSE / long-poll / WebSocket): PRD-163.
- Core-api restart reconciliation: PRD-164.
- Per-procedure ACL / scopes within the registry. Mutating endpoints are blocked-by-nginx as a whole; finer-grained auth is not needed.
- Rate limiting. Single-host single-user; no realistic abuse vector.
- TLS / mTLS. The docker network is the trust boundary.
- Multi-instance pillar registration (e.g. two finance-api containers both registering). Single-instance per pillar id; later registration overwrites. If you want HA, that's a separate ADR.
- Soft-delete / pillar archival. Deregister is a hard DELETE.
- Backup / restore of `pillar_registry`. It's reconstructed by the pillars themselves on next boot; no value in restoring a snapshot.
- Per-procedure event filtering (e.g. "I only want to be notified about finance events"). PRD-163's job to decide.
- Cross-host federation (multiple core-api instances syncing registry state). Single-host operating assumption.
