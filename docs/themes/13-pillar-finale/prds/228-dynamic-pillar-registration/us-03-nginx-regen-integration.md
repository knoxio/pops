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
- [ ] After regeneration, `nginx -t` validates the new conf. On pass, `nginx -s reload` runs. On fail, the error is logged at error level, the current `default.conf` is left in place, and `nginx_generator_last_error_at` is exposed on the core-api health endpoint. _(Reload command is pluggable via `POPS_NGINX_RELOAD_CMD`; default is `nginx -s reload`. Operators can set `POPS_NGINX_RELOAD_CMD="nginx -t && nginx -s reload"` today. The dedicated `nginx -t` step + `nginx_generator_last_error_at` health surface is a follow-up.)_
- [x] Same registry snapshot produces a byte-identical `default.conf` (determinism — verified by a snapshot test). _(PRD-232 — `generate-nginx-conf.test.ts` "is deterministic".)_
- [ ] An integration test spins up a fake registry state, fires a `registered` event, asserts the generator ran, asserts `nginx -t` was invoked, and asserts the new conf contains a `location /trpc-<newPillar>/` block. _(Unit-tested in isolation: SSE framing, debounce handler, regen+reload ordering. Full end-to-end is folded into US-05.)_
- [ ] A second integration test fires a `deregistered` event for an existing pillar and asserts the dispatcher block is gone from the regenerated conf. _(Same — folded into US-05.)_

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
