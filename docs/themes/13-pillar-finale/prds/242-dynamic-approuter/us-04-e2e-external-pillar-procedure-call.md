# US-04: End-to-end test — external pillar registers, procedure callable via `callDynamic`

> PRD: [PRD-242 — Dynamic `AppRouter` composition](README.md)

## Description

As a platform engineer, I want an integration test that registers an external pillar at runtime via the [PRD-228](../228-dynamic-pillar-registration/README.md) `/core.registry.register` endpoint and then calls one of its procedures via `pillar(id).callDynamic(routerName, procName, input)` so that the typed-vs-`callDynamic` split that PRD-242 ships is proven end-to-end.

## Acceptance Criteria

- [ ] An integration test lives at `apps/pops-api/src/__tests__/external-pillar-e2e.test.ts` (or equivalent path under the repo's existing integration-test layout).
- [ ] The test boots a throwaway pillar process exposing a single tRPC router with one query (`echo({ value }) => { value }`) and one mutation (`store({ key, value }) => { ok: true }`) — the smallest surface that exercises both kinds.
- [ ] The test calls `POST /core.registry.register` against `pops-core-api` with the pillar's manifest and `baseUrl`. Registration succeeds (per PRD-228 US-01).
- [ ] The test waits for the orchestrator's recompose debounce window (250ms + slack) and asserts that the registered pillar appears in the `core.registry.snapshot()` output with `origin: 'external'`.
- [ ] The test calls `pillar('<throwaway-id>').callDynamic('echo', 'echo', { value: 'ping' }, 'query')` against `pops-core-api` and asserts the response payload equals `{ value: 'ping' }`. The call goes through the orchestrator's `mergeRouters` passthrough to the throwaway pillar.
- [ ] The test calls `pillar('<throwaway-id>').callDynamic('echo', 'store', { key: 'k', value: 'v' }, 'mutation')` and asserts `{ ok: true }`.
- [ ] The test calls `POST /core.registry.deregister` and asserts that subsequent `callDynamic` calls return the `not-registered` shape per PRD-228's heartbeat/deregister semantics.
- [ ] The test does not edit `apps/pops-api/src/router.ts`. It does not edit the codegen catalogue. The external pillar reaches `appRouter` purely through registration + the orchestrator's runtime composition.
- [ ] The test runs in CI under the existing integration-test job. No new long-lived infrastructure is introduced; the throwaway pillar is an in-process node module or a container the test spins up and tears down.
- [ ] The test asserts at no point that the external pillar's procedures appear in the _static_ `AppRouter` type — they do not, by design.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The throwaway pillar's manifest must declare the `echo` router so PRD-228's validator (PRD-157) accepts it. Manifest fields beyond router declarations (settings, search adapters, AI tools) can be omitted.
- The test should not be a unit test against mocks. The whole point is to prove the loop closes against a real registration event + a real `callDynamic` call. Mocking either side hides the failure mode PRD-242 is fixing.
- `pillar(id).callDynamic` is the shipped escape hatch from [PR #3131](https://github.com/knoxio/pops/pull/3131) — see `packages/pillar-sdk/src/client/proxy.ts:26-72` and the existing tests at `packages/pillar-sdk/src/client/__tests__/call-dynamic.test.ts`. US-04 exercises it against a real external pillar rather than the existing mock-driven tests.
- This test is the load-bearing proof that the H3 finding is closed: an external pillar reaches `appRouter` purely by registering, no central file edit.
- The reserved-pillar-id rejection (PRD-228 US-01, US-02 collision check) is exercised separately — US-04's throwaway pillar uses a non-reserved id (e.g. `e2e-test-pillar`).
- The throwaway pillar can be a sibling tRPC server constructed in-process and bound to a free TCP port, matching the in-process integration-test pattern already used elsewhere in `apps/pops-api/src/__tests__/`.
