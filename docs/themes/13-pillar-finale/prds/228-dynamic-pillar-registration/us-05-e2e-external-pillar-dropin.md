# US-05: End-to-end external pillar drop-in test

> PRD: [Dynamic pillar registration](README.md)

## Description

As the maintainer of this theme, I want one integration test that exercises the
entire BE-lego promise — "drop a pillar in from another repo and it Just Works"
— so that regressions in any of US-01 through US-04 surface as a single,
unambiguous failure.

## Acceptance Criteria

- [ ] A new test under `apps/pops-core-api/src/modules/registry/__tests__/external-dropin.e2e.test.ts` boots a throwaway HTTP server inside the test process that serves a minimal tRPC manifest at `http://localhost:<port>/trpc` and behaves as a registered external pillar.
- [ ] The test calls `POST /core.registry.register` with a synthetic manifest (pillarId `e2e-drop-in`), a valid `POPS_INTERNAL_API_KEY`, and the local baseUrl. Asserts 200 + `{ ok: true }`.
- [ ] The test polls `core.registry.snapshot` until the new pillar appears with `status: 'healthy'`. Times out after 2s.
- [ ] The test invokes the nginx generator with the current snapshot and asserts the output contains a `location` block for `e2e-drop-in`. `nginx -t` validation is run when Docker is available; skipped (not failed) when not.
- [ ] The test sends a heartbeat and asserts `lastHeartbeatAt` advances in the snapshot.
- [ ] The test stops sending heartbeats and asserts the pillar flips to `status: 'unavailable'` within (intervalMs × missThreshold) + jitter.
- [ ] The test calls `POST /core.registry.deregister` and asserts the row is gone from the snapshot. The generator re-run no longer contains the `location` block.
- [ ] The test cleans up: shuts down the throwaway server, restores the registry to its pre-test state, restores `POPS_INTERNAL_API_KEY` env if it was overridden.
- [ ] Test runs in <10 seconds in CI (heartbeat intervals are dependency-injected for the test, not the real 10s ticker).

## Notes

This is the regression net for PRD-228 as a whole. If any single US ships
broken, this test should fail in an obvious way pointing at the specific step.

Use the same per-pillar smoke-harness pattern Theme 12 PRD-2920 established
— spin up a real HTTP server, exercise the contract end-to-end, tear down.
Don't mock the registry; use a real `core.db` against an in-memory or temp-dir
SQLite.

Avoid Playwright timeouts longer than necessary. The flip-to-unavailable check
should use the dependency-injected interval, not a real-world sleep.
