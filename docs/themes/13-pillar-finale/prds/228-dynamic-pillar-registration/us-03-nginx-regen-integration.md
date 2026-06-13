# US-03: Wire nginx generator to the registry

> PRD: [Dynamic pillar registration](README.md)

## Description

As an operator, I want the nginx dispatcher to be regenerated and reloaded
automatically whenever a pillar registers, deregisters, or is evicted, so that
new pillars are routable within seconds and stale ones stop receiving traffic
without manual intervention.

## Acceptance Criteria

- [ ] PRD-217's `scripts/generate-nginx-conf.ts` (or its successor) accepts a `RegistrySnapshot` as input — no compile-time `PILLARS` constant.
- [ ] Core-api subscribes to its own PRD-163 event bus and triggers regen on `registered`, `deregistered`, and `health-changed (→ unavailable via eviction)` events.
- [ ] Regen is debounced with a 250ms trailing window so a burst of registrations collapses into one regen + one `nginx -t` + one reload.
- [ ] After regeneration, `nginx -t` validates the new conf. On pass, `nginx -s reload` runs. On fail, the error is logged at error level, the current `default.conf` is left in place, and `nginx_generator_last_error_at` is exposed on the core-api health endpoint.
- [ ] Same registry snapshot produces a byte-identical `default.conf` (determinism — verified by a snapshot test).
- [ ] An integration test spins up a fake registry state, fires a `registered` event, asserts the generator ran, asserts `nginx -t` was invoked, and asserts the new conf contains a `location /trpc-<newPillar>/` block.
- [ ] A second integration test fires a `deregistered` event for an existing pillar and asserts the dispatcher block is gone from the regenerated conf.

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
