# US-03: Wire nginx generator to the registry

> PRD: [Dynamic pillar registration](README.md)

## Description

As an operator, I want the nginx dispatcher to be regenerated and reloaded
automatically whenever a pillar registers, deregisters, or is evicted, so that
new pillars are routable within seconds and stale ones stop receiving traffic
without manual intervention.

## Acceptance Criteria

- [x] PRD-217's `scripts/generate-nginx-conf.ts` (or its successor) accepts a `RegistrySnapshot` as input — no compile-time `PILLARS` constant. _(PRD-232 — `renderNginxConfDynamic` takes a `RegistryFetcher`.)_
- [x] A subscriber to the PRD-163 event bus triggers regen on `registered`, `deregistered`, and `health-changed` events. _(Implemented as an out-of-process watcher `apps/pops-shell/scripts/watch-registry-and-reload.ts` consuming `GET /registry/subscribe` rather than an in-core-api listener; satisfies the contract from PRD-228 — every register / deregister / eviction results in a regen attempt — without coupling the registry process to nginx.)_
- [x] Regen is debounced with a 250ms trailing window so a burst of registrations collapses into one regen + one reload. _(See `createReloadHandler` in `nginx-event-reload.ts`.)_
- [x] After regeneration, `nginx -t` validates the new conf. On pass, `nginx -s reload` runs. On fail, the error is logged at error level, the current `default.conf` is left in place, and `nginx_generator_last_error_at` is exposed on the watcher's health endpoint. _(Dedicated validate stage in `createReloadHandler` via `POPS_NGINX_CONFIG_TEST_CMD` (default `nginx -t -c <output>`; empty string disables). `nginx_generator_last_error_at` exposed by `nginx-generator-health.ts` as a JSON endpoint, opt-in via `POPS_NGINX_HEALTH_PORT`. Returns 503 + `{ stage, message, at }` while degraded; clears on the next clean cycle.)_
- [x] Same registry snapshot produces a byte-identical `default.conf` (determinism — verified by a snapshot test). _(PRD-232 — `generate-nginx-conf.test.ts` "is deterministic".)_
- [x] An integration test spins up a fake registry state, fires a `registered` event, asserts the generator ran, and asserts the reload command was invoked. _(`watch-registry-and-reload.e2e.test.ts` runs the watcher end-to-end against a fake SSE registry with stubbed exec, asserting regen + `nginx -t` + `nginx -s reload` ordering and the gating skip behaviour.)_
- [x] A second integration test fires a `deregistered` event for an existing pillar and asserts regen + reload run again. _(Same e2e file — second emit triggers a second regen + validate + reload pair.)_

## Notes

PRD-217 shipped the static-pillars half. The audit table inside PRD-217's
README is now extended (PR description references the parallel update). Don't
rewrite the generator from scratch — extend it to take a snapshot argument and
move the snapshot-fetch call out of the build step into the event handler.

The trigger surface (event-bus subscription vs post-mutation hook) is an
implementation choice. The contract is: every register / deregister / eviction
MUST result in a regen attempt. If you pick the post-mutation hook, document
the trade-off (simpler, but loses the debounce benefit unless you add a queue).

Reload races: nginx handles `nginx -s reload` gracefully under load; no
in-flight requests are dropped. No need to coordinate with active connections.
