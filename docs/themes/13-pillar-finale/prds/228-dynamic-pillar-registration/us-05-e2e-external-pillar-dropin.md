# US-05: End-to-end external pillar drop-in test

> PRD: [Dynamic pillar registration](README.md)

## Description

As the maintainer of this theme, I want one integration test that exercises the
entire BE-lego promise — "drop a pillar in from another repo and it Just Works"
— so that regressions in any of US-01 through US-04 surface as a single,
unambiguous failure.

## Acceptance Criteria

- [x] A new test under `apps/pops-core-api/src/modules/registry/__tests__/external-dropin.e2e.test.ts` boots a throwaway HTTP server inside the test process (the `@pops/wire-conformance` fixture pillar) and uses its `baseUrl` for the registration handshake.
- [x] The test calls `POST /core.registry.register` with a synthetic manifest, a valid shared key, and the fixture's `baseUrl`. Asserts 200 + `{ ok: true }`. Pillar slug is `drop-in` (PRD-157's contract-tag regex rejects digits in the pillar segment, so `e2e-drop-in` is not a legal manifest contract; the lifecycle being proved is independent of the literal slug).
- [x] The test asserts the persisted row via `pillarRegistryService.getPillarRegistration` — `origin: 'external'`, `status: 'healthy'`, `apiKeyHash` equals `sha256(sharedKey)`, and a `registered` event is emitted on the in-process bus.
- [x] The test invokes the live `renderNginxConfDynamic` against the in-process core-api on an ephemeral port and asserts the rendered conf contains a `location /trpc-<pillar>/` block plus the upstream host:port resolved from the registered `baseUrl`. A second case proves resolution for a non-loopback (docker-network-shaped) baseUrl.
- [x] The test backdates `lastHeartbeatAt` + flips status to `unavailable` past `EVICTION_THRESHOLD_MS`, drives one `runEvictionTick`, and asserts the row is DELETEd with a `deregistered` event carrying `reason: 'lost-heartbeat'` + `evictedAt`. The generator re-run no longer contains the block.
- [x] The test re-registers with a rotated shared key and asserts the row is live again with a rotated `apiKeyHash` and a fresh `registeredAt`.
- [x] The test calls `POST /core.registry.deregister` with the rotated key and asserts the row is DELETEd with a single `deregistered` event carrying `reason: 'requested'`. The generator re-run no longer contains the block.
- [x] The test cleans up: shuts down the fixture pillar, the in-process core-api server, and the temp-dir `core.db`.
- [x] Whole test runs in well under a second (eviction is exercised via the synchronous `runEvictionTick`, not the real 30s ticker).

## Notes

This is the regression net for PRD-228 as a whole. If any single US ships
broken, this test should fail in an obvious way pointing at the specific step.

Use the same per-pillar smoke-harness pattern Theme 12 PRD-2920 established
— spin up a real HTTP server, exercise the contract end-to-end, tear down.
Don't mock the registry; use a real `core.db` against an in-memory or temp-dir
SQLite.

Avoid Playwright timeouts longer than necessary. The flip-to-unavailable check
should use the dependency-injected interval, not a real-world sleep.
