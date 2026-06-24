# Discovery client — wire dispose into bootstrap shutdown

Carved out of the [Discovery client PRD](../themes/federation/prds/discovery-client/README.md). Everything else in that PRD is built and tested; this is the one piece that isn't.

## What's missing

`disposeDiscoveryClient()` exists and works (cancels the background timer, resets cache state) but **nothing calls it on pillar shutdown**. `bootstrapPillar(...).stop()` (`libs/sdk/src/bootstrap/bootstrap.ts`) only:

1. clears its own heartbeat interval, and
2. best-effort `unregister()`s against the registry.

It never calls `disposeDiscoveryClient()`, so the discovery cache's background refresh timer is left armed after `stop()`.

## Why it hasn't bitten anyone

The discovery cache timer is `unref()`'d (`unrefTimer` in `cache-internals.ts`), so it never keeps the Node process alive past the last open handle. Shutdown completes regardless. The wiring the original spec asked for is a correctness/tidiness gap, not an active bug.

## The work

- In `bootstrapPillar`'s `stop()`, after unregistering, call `disposeDiscoveryClient()` from `@pops/pillar-sdk/discovery`.
- Guard against double-dispose (the existing `stopped` flag already short-circuits a second `stop()`).
- Test: a bootstrapped-then-stopped pillar has no armed discovery background timer (assert via an injected fake timer / `clearTimeout` spy, or that no further fetch fires after `stop()`).

## Acceptance criteria

- [ ] `bootstrapPillar(...).stop()` calls `disposeDiscoveryClient()` so the discovery background timer is cancelled on `stop()` / SIGTERM.
- [ ] Stopping twice is a no-op (no double-dispose error).
- [ ] A unit test asserts the discovery timer is torn down after `stop()`.
