# PRD-158: `bootstrapPillar()` boot helper

> Epic: [Pillar SDK](../../epics/01-pillar-sdk.md)

## Overview

A single-call helper that takes a manifest + a few callbacks and produces a fully-running pillar: validated manifest, DB opened with migrations applied, Express app with routes mounted, healthcheck wired, registered with the central registry, heartbeat ticking, SIGTERM-aware. The pillar's `apps/pops-<pillar>-api/src/server.ts` becomes ~30 lines instead of the current ~100-line hand-rolled scaffold each pillar maintains today.

Boot sequence is **register-first-then-serve**: HTTP traffic only flows once the registry has accepted the manifest. Shutdown is **explicit-deregister-then-drain**: SIGTERM triggers a registry deregister POST, then a 10s drain of in-flight requests, then DB close + exit. Heartbeat failures retry forever with exponential backoff and surface via an `onMissedHeartbeat` hook so operators can alert externally.

## Data Model

### Config object

```ts
// @pops/pillar-sdk/types.ts

import type { Express } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { ManifestPayload } from './manifest-schema';

export type OpenDbResult = {
  raw: import('better-sqlite3').Database;
  db: unknown; // drizzle wrapper; consumer-specific generic
};

export type PillarBootstrapConfig<TPayload extends ManifestPayload = ManifestPayload> = {
  /** Pre-built manifest from the contract's buildManifestPayload(). */
  manifest: TPayload;

  /** Opens the pillar's DB. The dbPath comes from env (e.g. FINANCE_SQLITE_PATH). */
  openDb: (config: { dbPath: string }) => Promise<OpenDbResult> | OpenDbResult;

  /** Mounts the pillar's tRPC routes (and any custom Express handlers) onto the app. */
  mountRoutes: (app: Express, context: { db: OpenDbResult }) => void;

  /** Port to listen on. Default: process.env.PORT or 3000. */
  port?: number;

  /** Path to the SQLite file. Default: resolved from the pillar's *_SQLITE_PATH env. */
  dbPath?: string;

  /** Registry base URL. Default: process.env.POPS_REGISTRY_URL or http://core-api:3001. */
  registryUrl?: string;

  /** Heartbeat interval. Default: 10_000ms. */
  heartbeatIntervalMs?: number;

  /** Max drain wait on SIGTERM. Default: 10_000ms. */
  drainTimeoutMs?: number;

  /** Lifecycle hooks. */
  hooks?: {
    onRegistered?: () => void | Promise<void>;
    onDeregistered?: () => void | Promise<void>;
    onMissedHeartbeat?: (consecutiveMisses: number, err: unknown) => void;
    onShutdownStart?: () => void;
    onShutdownComplete?: () => void;
  };
};

export type PillarRuntime = {
  app: Express;
  server: HttpServer;
  shutdown: (reason?: string) => Promise<void>;
};
```

### Internal state machine

```
[NEW]
  └─ validateManifest()
       ├─ fail → CRASH (per-field issues logged)
       └─ ok → [DB_OPEN]
              └─ openDb()
                    ├─ fail → CRASH (error logged)
                    └─ ok → [REGISTERING]
                           └─ POST /core.registry.register (exponential backoff, max 30s)
                                ├─ fail (4xx with issues) → CRASH (registry rejected; per-field issues logged)
                                └─ ok → [LISTENING]
                                       ├─ start Express server
                                       ├─ start heartbeat ticker
                                       └─ install SIGTERM/SIGINT handlers
[LISTENING]
  ├─ heartbeat success → stay [LISTENING]
  ├─ heartbeat miss → log + invoke hook; retry with backoff; stay [LISTENING]
  └─ SIGTERM → [DRAINING]
             ├─ stop accepting new connections (server.close)
             ├─ POST /core.registry.deregister (best-effort, 5s timeout)
             ├─ wait for in-flight requests up to drainTimeoutMs
             ├─ close DB
             └─ exit(0)
```

## API Surface

### Main export

```ts
// @pops/pillar-sdk

export async function bootstrapPillar<TPayload extends ManifestPayload>(
  config: PillarBootstrapConfig<TPayload>
): Promise<PillarRuntime>;
```

### Pillar call-site (example)

```ts
// apps/pops-finance-api/src/server.ts
import { bootstrapPillar } from '@pops/pillar-sdk';
import { buildManifestPayload } from '@pops/finance-contract/manifest';
import { openFinanceDb } from '@pops/finance-db';
import { mountFinanceRoutes } from './routes';
import { resolveFinanceSqlitePath } from './finance-sqlite-path';

const manifest = buildManifestPayload({
  routes: {
    queries: ['finance.wishlist.list', 'finance.wishlist.get', 'finance.budgets.list' /* ... */],
    mutations: ['finance.wishlist.create', 'finance.budgets.create' /* ... */],
  },
});

const runtime = await bootstrapPillar({
  manifest,
  dbPath: resolveFinanceSqlitePath(),
  openDb: ({ dbPath }) => openFinanceDb(dbPath),
  mountRoutes: (app, { db }) => mountFinanceRoutes(app, db),
});

// runtime.shutdown() available for manual control
```

### `/health` endpoint (always mounted)

```jsonc
GET /health → 200
{
  "ok": true,
  "pillar": "finance",
  "version": "1.4.2",
  "contract": { "package": "@pops/finance-contract", "version": "1.4.2" },
  "registered": true,           // false during DB_OPEN / REGISTERING states
  "lastHeartbeatAt": "2026-06-12T03:04:05Z",
  "missedHeartbeats": 0
}
```

### Healthcheck during shutdown

```jsonc
GET /health → 503        // during DRAINING
{ "ok": false, "pillar": "finance", "state": "draining" }
```

### Test harness exports

```ts
// @pops/pillar-sdk/testing

export function createTestRegistryClient(): {
  client: RegistryClient;
  registrations: ManifestPayload[];
  heartbeats: { pillarId: string; at: Date }[];
};

export function injectRegistryClient(client: RegistryClient): void;
```

Pillar tests can inject a mock registry client and assert on what would have been posted, without spinning up a real core-api.

## Business Rules

- **Manifest validation runs first.** Failure crashes the boot with the per-field issue report from PRD-157. No partial boot.
- **DB-open is sync-or-async; the helper awaits it.** Lets `openFinanceDb()` (currently sync) be wrapped without refactoring it to async.
- **Registration uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...** Capped at 30s between retries. Retries forever — the pillar will not give up if the registry is slow to come up. Bootstrap blocks until success.
- **The pillar does NOT listen on the HTTP port until registration succeeds.** That's the "register-first-then-serve" guarantee. Consumers querying the registry see only fully-registered pillars; consumers hitting the pillar directly via a cached baseUrl get connection refused until it's listening.
- **Heartbeat interval defaults to 10s.** Configurable via `heartbeatIntervalMs`. Failures DO NOT crash the pillar — they trigger `onMissedHeartbeat(count, err)` and continue. Count resets on success.
- **Heartbeat retry uses exponential backoff per consecutive miss.** First miss → retry in 5s. Second miss → 10s. Third → 20s. Caps at the heartbeat interval (10s default). Prevents a thundering-herd against a struggling registry.
- **Healthcheck reflects state.** `/health` returns 200 with `"registered": false` during DB_OPEN / REGISTERING. Returns 503 during DRAINING. Returns 200 with full details once LISTENING.
- **SIGTERM + SIGINT both trigger the drain.** Docker stops typically send SIGTERM; Ctrl+C during dev sends SIGINT. Both handled identically.
- **Deregister is best-effort.** If the registry is down at shutdown, the POST times out (5s) and the pillar exits anyway. Registry will mark it `unavailable` after the next missed heartbeat regardless.
- **Drain waits up to `drainTimeoutMs` for in-flight requests.** Default 10s. After drain timeout, in-flight requests are terminated; clients see a connection-reset.
- **No automatic restart.** Crashes propagate to the container runtime (Docker). The compose restart policy handles re-launch. The SDK is not a process supervisor.
- **The Express app is constructed by the SDK, not the pillar.** Pillar gets it via `mountRoutes(app, context)` to mount its routes. Means CORS, body parsing, request logging, etc. can be standardised in one place.
- **No SDK-imposed body parser, CORS, or middleware.** The SDK provides a bare Express app; the pillar's `mountRoutes` callback adds whatever middleware it needs. (This is conservative; can be revisited if every pillar duplicates the same setup.)
- **Test harness mocks the registry client at module level.** `injectRegistryClient(mock)` replaces the singleton; tests reset between cases.

## Edge Cases

| Case                                                                                   | Behaviour                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry returns 400 (validation failure) at registration                              | Crash with the registry's per-field issues array. Likely indicates the pillar's manifest was hand-edited / regenerated but bumped a constraint.                               |
| Registry returns 5xx at registration                                                   | Treated as transient; retry with backoff. Pillar logs the response body for debugging.                                                                                        |
| Pillar's port is already in use                                                        | Express server start throws `EADDRINUSE`; bootstrap crashes. Not the SDK's job to find a free port.                                                                           |
| Container is killed (SIGKILL) instead of SIGTERM                                       | No drain, no deregister. Registry marks the pillar `unavailable` after the next missed heartbeat. Acceptable.                                                                 |
| `openDb()` throws synchronously                                                        | Crash before registration. Error message logged with the dbPath.                                                                                                              |
| Heartbeat receives a "pillar not registered" response (registry restarted, lost state) | SDK re-runs the registration flow, then resumes heartbeat. `onRegistered` is invoked again.                                                                                   |
| Manifest is mutated between boot and a heartbeat                                       | The SDK's heartbeat payload is `{ pillarId }` only, not the full manifest. Manifest is snapshotted at boot. Re-registration to update the manifest requires a pillar restart. |
| SIGTERM during DB_OPEN or REGISTERING                                                  | Bootstrap aborts; exit(1) without registering. No deregister needed (never registered).                                                                                       |
| `mountRoutes` throws                                                                   | Crash during Express setup. Pillar must not have buggy route mounting code.                                                                                                   |
| Two SIGTERMs in quick succession                                                       | First triggers drain; second is ignored (drain is already in progress).                                                                                                       |
| Registry URL is malformed                                                              | Bootstrap crashes at the first registration attempt with a clear "invalid URL" message.                                                                                       |
| HTTP server fails to start (e.g. permission denied on port 80)                         | Crash; registration was successful but now we're in an inconsistent state. SDK best-effort POSTs a deregister before exit.                                                    |
| In-flight request exceeds `drainTimeoutMs`                                             | Connection is forcibly closed. Client sees `ECONNRESET`. Configured behaviour; not a bug.                                                                                     |
| Heartbeat tick fires during DRAINING                                                   | Tick is no-op; the heartbeat interval is cleared at drain start.                                                                                                              |
| Test calls `bootstrapPillar` without injecting a mock registry client                  | The real registry client is used; if `POPS_REGISTRY_URL` isn't set, it tries `http://core-api:3001` and fails. Test setup must explicitly inject.                             |

## User Stories

| #   | Story                                                             | Summary                                                                                                                     | Parallelisable                                  |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-registry-client](us-01-registry-client.md)                 | Tiny HTTP client wrapping the three registry endpoints (register, heartbeat, deregister) with exponential backoff           | yes — independent of bootstrap state machine    |
| 02  | [us-02-state-machine](us-02-state-machine.md)                     | The boot state machine: NEW → DB_OPEN → REGISTERING → LISTENING → DRAINING                                                  | blocked by us-01                                |
| 03  | [us-03-express-bootstrap](us-03-express-bootstrap.md)             | Construct Express app; wire `/health`; call `mountRoutes`; start `http.Server` on configured port                           | yes — independent of registry concerns          |
| 04  | [us-04-heartbeat-loop](us-04-heartbeat-loop.md)                   | The ticking heartbeat with exponential backoff on failures + `onMissedHeartbeat` hook                                       | blocked by us-01                                |
| 05  | [us-05-shutdown-handler](us-05-shutdown-handler.md)               | SIGTERM/SIGINT → drain → deregister → DB close → exit; with `drainTimeoutMs`                                                | blocked by us-02 + us-04                        |
| 06  | [us-06-healthcheck-impl](us-06-healthcheck-impl.md)               | `/health` reflects state correctly across boot phases                                                                       | blocked by us-02                                |
| 07  | [us-07-test-harness](us-07-test-harness.md)                       | `createTestRegistryClient` + `injectRegistryClient` for unit tests; replay-of-posts assertion helpers                       | blocked by us-01                                |
| 08  | [us-08-finance-migration-pilot](us-08-finance-migration-pilot.md) | Migrate `apps/pops-finance-api/src/server.ts` to `bootstrapPillar()`; verify behavioural parity end-to-end                  | blocked by us-02..06                            |
| 09  | [us-09-integration-tests](us-09-integration-tests.md)             | End-to-end tests: full boot → register → heartbeat → SIGTERM → drain → deregister cycle against a real (in-memory) core-api | blocked by us-08 + Epic 02's registry endpoints |
| 10  | [us-10-author-docs](us-10-author-docs.md)                         | `packages/pillar-sdk/README.md` — how to write a new pillar's server.ts                                                     | blocked by us-08                                |

## Out of Scope

- Process supervision / auto-restart on crash. Docker's restart policy handles this.
- Configurable retry-cap (e.g. "crash after N registration attempts"). Retry-forever is intentional; ops alerts handle the long-tail.
- Multi-instance pillars (load balancing N copies of finance-api). Single-instance per pillar id is the operating assumption (per ADR-027).
- Built-in body parser, CORS, request logging middleware. Pillars add what they need. Revisit if patterns emerge.
- TLS termination. Pillars listen plain HTTP inside the docker network; nginx terminates TLS at the edge.
- Hot-reload of the manifest at runtime (e.g. when adding a new procedure without restarting). Requires a pillar restart; out of scope.
- Streaming healthcheck (SSE for live status updates). Plain JSON polling is enough.
- WebSocket transport for tRPC subscriptions. `subscriptions` field in the manifest is reserved; transport TBD.
- Metrics emission (Prometheus, OTel). `onMissedHeartbeat` provides the hook; pillars can wire their own collectors. Standardising metrics is a separate concern.
