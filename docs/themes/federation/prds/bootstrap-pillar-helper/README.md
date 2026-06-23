# PRD: `bootstrapPillar()` boot helper

> Theme: [Pillar Finale](../../README.md) · SDK: `@pops/pillar-sdk/bootstrap` (`libs/sdk/src/bootstrap`)

## Overview

A single-call helper that takes a validated manifest and a self base URL, registers the pillar with the central `registry` pillar, and runs a heartbeat ticker for the life of the process. It returns a handle whose `stop()` clears the heartbeat and best-effort deregisters. The helper is **registration + heartbeat only** — it does not own the HTTP server, the database, the route table, or signal handling. Each pillar still constructs its own Express app, opens its own SQLite DB, calls `app.listen(port)`, and installs its own `SIGTERM`/`SIGINT` handler that calls `handle.stop()` during shutdown.

Registration is **retry-with-cap**: `register` is attempted up to `maxRegisterAttempts` (default 5) with exponential backoff; on a non-retriable rejection (4xx) it throws immediately, and on exhausting attempts it throws `PillarRegistrationFailedError`. Bootstrap is `await`ed before the pillar starts listening in the pillars that gate it behind `POPS_REGISTRY_ENABLED`, but the SDK itself does not block the HTTP port — the pillar decides ordering.

The transport speaks plain HTTP-JSON to the registry's three handshake routes, preferring the canonical slash paths (`/registry/{register,heartbeat,deregister}`) and falling back to the legacy dotted paths (`/core.registry.*`) on a 404 during the rolling-deploy window.

## Data Model / Contract

### `BootstrapPillarOptions`

```ts
// @pops/pillar-sdk/bootstrap

export interface BootstrapPillarOptions {
  /** Pre-built, schema-valid manifest from the pillar's buildManifest(). */
  manifest: ManifestPayload;

  /** Absolute base URL other pillars dial to reach this pillar (e.g. http://finance-api:3004).
   *  Persisted server-side as PillarRegistryEntry.baseUrl; carried in the register envelope. */
  baseUrl: string;

  /** Optional snapshot of this pillar's owned capability statuses (<capabilityKey> → up/down).
   *  Called once on register and again on every heartbeat. Omitted → no `capabilities` on the wire. */
  capabilityReporter?: () => Record<string, boolean>;

  /** Optional app to mount the /health route on (anything with a compatible .get(path, handler)). */
  app?: HealthApp;

  /** Override the registry transport (tests inject a recording transport). */
  transport?: RegistryTransport;

  heartbeatMs?: number; // default 10_000
  maxRegisterAttempts?: number; // default 5
  registerInitialBackoffMs?: number; // default 1_000
  registerMaxBackoffMs?: number; // default 30_000
  logger?: BootstrapLogger; // default console-backed
  registryUrl?: string; // default POPS_REGISTRY_URL ?? http://registry-api:3001

  // Timer seams for deterministic tests.
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  setTimeoutImpl?: typeof setTimeout;
}

export interface PillarBootstrapHandle {
  pillarId: string;
  stop(): Promise<void>;
}
```

### Register envelope (POST body)

```ts
export interface RegisterRequest {
  pillarId: string; // == manifest.pillar
  baseUrl: string;
  manifest: ManifestPayload; // PUSHED here; never pulled over HTTP later
  capabilities?: Record<string, boolean>; // present only if a reporter is supplied
}
```

The manifest is snapshotted at boot. The registry persists it and re-serves it in the discovery snapshot; it is never fetched back from `baseUrl`. Heartbeat payloads carry only `{ pillarId, capabilities? }`, never the full manifest.

## REST Surface

The SDK is a client of the registry, not a server. The routes it dials (served by `pillars/registry`):

| Op         | Canonical path              | Legacy fallback                  | Body                                             | Success                                                            |
| ---------- | --------------------------- | -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| register   | `POST /registry/register`   | `POST /core.registry.register`   | `{ pillarId, baseUrl, manifest, capabilities? }` | `200 { ok, pillarId, registeredAt, heartbeatIntervalMs }`          |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  | `{ pillarId, capabilities? }`                    | `200 { ok, ... }` (or `200 { ok:false, reason:'not-registered' }`) |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` | `{ pillarId }`                                   | `200`/`204`                                                        |

Path selection: the transport tries the canonical path first and, on a `404`, retries the legacy path and remembers the working leg for subsequent calls (`registry-path-resolver`). Each request runs under an `AbortController` timeout (default 10s).

### `/health` route (only if `app` is passed)

`mountHealthRoute` registers a single `GET` on `manifest.healthcheck.path` (e.g. `/healthz`) that always returns `200`:

```jsonc
GET /healthz → 200
{
  "ok": true,
  "status": "ok",
  "pillar": "finance",
  "version": "1.2.3",
  "ts": "2026-06-12T03:04:05.000Z",
  "contract": { "package": "@pops/finance", "version": "1.2.3" }
}
```

It carries no `registered`, `lastHeartbeatAt`, or `missedHeartbeats` fields, and does not flip to `503` during shutdown — the response is static apart from `ts`. A pillar that wants liveness gating builds that on its own route.

## Call-Site

```ts
// pillars/finance/src/api/server.ts (abridged — full shutdown is the pillar's, not the SDK's)
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

const app = createFinanceApiApp({ financeDb, version, selfBaseUrl, contacts });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildFinanceManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildFinanceCapabilityReporter(),
  });
}

const server = app.listen(port);

function shutdown(signal: NodeJS.Signals): void {
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => financeDb.raw.close());
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

Registration is opt-in per pillar behind `POPS_REGISTRY_ENABLED=true`. When unset, the pillar serves its REST surface without ever registering.

## Rules

- **Manifest validation runs first.** `validateManifestPayload` is called before any network I/O; failure throws `PillarManifestInvalidError` carrying the per-field issues. `register` is never attempted (`registerCalls === 0`).
- **Version coercion.** A non-semver `manifest.version` (e.g. a 40-char git SHA injected as `BUILD_VERSION`) is coerced to `0.0.0-sha.<first7>` — and the same coercion is mirrored onto `contract.version` and `contract.tag` (`contract-<pillar>@v…`) — so a Watchtower deploy never crashes boot on the schema's semver constraint. Already-semver values pass through untouched.
- **Registration backoff is capped, not infinite.** Delay is `min(initialBackoffMs * 2^(attempt-1), maxBackoffMs)`. After `maxRegisterAttempts` failures it throws `PillarRegistrationFailedError(attempts, lastCause)`. A 4xx (`retriable === false`) short-circuits to `PillarRegistrationRejectedError(status, issues)` without consuming further attempts.
- **5xx and network errors are retriable.** `RegistryTransportError` with `status >= 500` and `RegistryNetworkError` both retry under backoff until the cap.
- **Heartbeat ticks at `heartbeatMs` (default 10s).** Each tick posts `{ pillarId, capabilities? }`, re-snapshotting the capability reporter so a flipped capability is seen on the next tick. Failures are caught and logged via `logger.warn`; they never crash the loop and never alter the interval.
- **The heartbeat interval is `unref()`-ed** so it does not keep the process alive on its own.
- **`stop()` is idempotent.** First call clears the interval and best-effort `unregister(pillarId)`; a thrown unregister is swallowed and logged. Subsequent calls are no-ops (`unregisterCalls` stays at 1).
- **The SDK owns neither the HTTP server nor signals.** No `app.listen`, no `SIGTERM` handler, no drain, no DB lifecycle inside `bootstrapPillar`. The pillar wires those and calls `handle.stop()` from its own shutdown path.
- **Registry URL resolution:** explicit `registryUrl` → `POPS_REGISTRY_URL` → `http://registry-api:3001`. Trailing slashes are stripped.

## Edge Cases

| Case                                                      | Behaviour                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Manifest malformed (bad pillar id, invalid route names)   | `PillarManifestInvalidError` with `.issues[]`; no register call.                                               |
| Registry returns 400 at register                          | `PillarRegistrationRejectedError(400, issues)` immediately; one register call, no retry.                       |
| Registry returns 5xx at register                          | Retried under backoff up to `maxRegisterAttempts`, then `PillarRegistrationFailedError`.                       |
| Network refused (`ECONNREFUSED`) at register              | Treated as `RegistryNetworkError`, retried under backoff; throws after the cap.                                |
| Canonical registry path returns 404                       | Transport falls back to the legacy dotted path and pins that leg for later calls.                              |
| Heartbeat throws                                          | Caught, `logger.warn`, loop continues; next tick fires on schedule.                                            |
| Heartbeat returns `{ ok:false, reason:'not-registered' }` | Delivered as a normal `200`; the SDK does **not** auto re-register. Re-registration requires a pillar restart. |
| Request hangs                                             | `AbortController` aborts at `timeoutMs` (default 10s); surfaces as a network error.                            |
| `unregister` throws at shutdown                           | Swallowed; `stop()` still resolves. Registry evicts the stale entry after missed heartbeats.                   |
| `stop()` called twice                                     | Second call is a no-op; exactly one `unregister`.                                                              |
| `app` omitted                                             | No `/health` route mounted; registration + heartbeat proceed normally.                                         |
| `app.get` throws while mounting `/health`                 | Caught and logged; bootstrap continues (health is best-effort).                                                |
| Container SIGKILL'd                                       | No `stop()`, no deregister; registry marks the pillar unavailable after missed heartbeats.                     |

## Acceptance Criteria

- [x] `bootstrapPillar` validates the manifest first and throws `PillarManifestInvalidError` (with `.issues`) before any register call.
- [x] Happy path registers exactly once and returns a handle with `pillarId === manifest.pillar`.
- [x] `capabilityReporter` is snapshotted on register and re-snapshotted on every heartbeat; omitting it drops `capabilities` from both wires.
- [x] Non-semver `version` is coerced to `0.0.0-sha.<7>` across `version`, `contract.version`, and `contract.tag`; valid semver passes through.
- [x] A 4xx register response throws `PillarRegistrationRejectedError` immediately (one attempt, no retry).
- [x] 5xx / network failures retry with exponential backoff and throw `PillarRegistrationFailedError` after `maxRegisterAttempts`; a later successful attempt resolves normally.
- [x] Heartbeat fires at `heartbeatMs`; heartbeat failures log and do not crash the loop.
- [x] `stop()` clears the interval, best-effort `unregister`s, is idempotent, and resolves even if `unregister` throws.
- [x] `/health` is mounted on `manifest.healthcheck.path` when `app` is supplied and returns `{ ok, pillar, version, contract, ts }`.
- [x] Transport prefers `/registry/*` and falls back to `/core.registry.*` on 404, under a per-request abort timeout.
- [x] Adopted as the registration path by finance, media, food, lists, inventory, ai, cerebrum, and the orchestrator (behind `POPS_REGISTRY_ENABLED`).

## Out of Scope

- Process supervision / auto-restart on crash — Docker's restart policy handles it.
- A boot state machine and "register-first-then-serve" gating inside the SDK — the pillar owns listen ordering. (See [idea](../../../../ideas/bootstrap-pillar-helper.md).)
- SDK-owned signal handling, request draining, and `drainTimeoutMs`. (idea)
- Lifecycle hooks (`onRegistered`, `onMissedHeartbeat`, `onShutdownStart`, …). (idea)
- `openDb`/`mountRoutes` callbacks and an SDK-constructed Express app — pillars build their own. (idea)
- A state-aware `/health` (`registered`, `lastHeartbeatAt`, `missedHeartbeats`, `503` during drain). (idea)
- Heartbeat-specific backoff and auto re-registration on a `not-registered` response. (idea)
- A `@pops/pillar-sdk/testing` registry-mock harness (`createTestRegistryClient`, `injectRegistryClient`) — tests inject a recording `transport` directly via the `transport` option. (idea)
- TLS termination (nginx at the edge), manifest hot-reload, WebSocket subscriptions, Prometheus/OTel metrics.
