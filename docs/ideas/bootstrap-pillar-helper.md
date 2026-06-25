# Idea: richer `bootstrapPillar()` lifecycle

The shipped [`bootstrapPillar()`](../themes/federation/prds/bootstrap-pillar-helper.md) is deliberately thin: validate manifest → register (capped retry) → heartbeat → `stop()`. Each pillar still hand-rolls its Express app, DB lifecycle, `app.listen`, and `SIGTERM`/`SIGINT` handler. The following were specced but never built; they would fold the per-pillar boilerplate into the SDK.

## Boot state machine + register-first-then-serve

A `NEW → DB_OPEN → REGISTERING → LISTENING → DRAINING` machine where the HTTP port opens only after registration succeeds, so the registry never advertises a pillar that isn't yet listening. Today the pillar decides ordering (and most `await bootstrapPillar()` before `app.listen`, but the SDK does not enforce it).

## SDK-owned server, DB, and routes

`openDb({ dbPath })` + `mountRoutes(app, { db })` callbacks, with the SDK constructing the Express app and returning `{ app, server, shutdown }`. Lets CORS / body-parsing / request logging be standardised in one place. Currently each pillar builds its own app and passes only `app` (for the `/health` mount) plus `baseUrl`.

## SDK-owned signal handling + drain

SDK installs `SIGTERM`/`SIGINT` handlers that: stop accepting connections, best-effort deregister (5s timeout), wait up to `drainTimeoutMs` (default 10s) for in-flight requests, close the DB, exit. Second signal during drain is ignored. Today every pillar writes this loop itself.

## Lifecycle hooks

`onRegistered`, `onDeregistered`, `onMissedHeartbeat(count, err)`, `onShutdownStart`, `onShutdownComplete`. The `onMissedHeartbeat` hook is the intended seam for external alerting / metrics without baking Prometheus/OTel into the SDK.

## Heartbeat backoff + auto re-registration

Per-consecutive-miss backoff (`5s, 10s, 20s`, capped at the heartbeat interval) instead of a fixed-interval retry, plus: on a `{ ok:false, reason:'not-registered' }` heartbeat response (registry restarted and lost state), re-run the registration flow and resume — re-firing `onRegistered`. Today a missed heartbeat just logs, the interval is unchanged, and `not-registered` is ignored (recovery needs a pillar restart).

## State-aware `/health`

`/health` reporting `registered` (false during DB_OPEN/REGISTERING), `lastHeartbeatAt`, and `missedHeartbeats`, and flipping to `503` during `DRAINING`. Today the route is static `200 { ok, pillar, version, contract, ts }`.

## `@pops/pillar-sdk/testing` registry mock

`createTestRegistryClient()` returning `{ client, registrations[], heartbeats[] }` and `injectRegistryClient(client)` to swap a module-level singleton, so pillar tests assert on what would have been posted. Superseded in practice by the `transport` option on `BootstrapPillarOptions` — tests already inject a recording transport directly — but a packaged harness would remove the per-test boilerplate.
