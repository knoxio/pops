# US-04: End-to-end integration test for `pillar('core').settings.*` cross-pillar reads + writes

> PRD: [PRD-247 — core.settings.\* cross-pillar SDK surface](README.md)

## Description

As an operator, I want a single integration test that boots `pops-core-api` + `pops-api` (or the in-process equivalents that share the same transport seam) and exercises the cross-pillar settings surface end-to-end, so a regression in transport, auth, contract, or discovery is caught at CI time rather than during a Plex sync failure.

## Acceptance Criteria

- [x] A test at `apps/pops-core-api/src/__tests__/core-settings-sdk-itest.test.ts` (the established cross-pillar integration test home — mirrors `apps/pops-cerebrum-api/src/__tests__/embeddings-sdk-itest.test.ts` for PRD-249 US-04) that:
  - [x] Boots `pops-core-api` (real HTTP server on an ephemeral port) and a minimal Express app modelling the pops-api side with a media-shaped handler at `POST /media/settings/*`.
  - [x] Configures `POPS_INTERNAL_API_KEY` via fixture — the seeded service-account plaintext key is loaded into `process.env` for the suite and restored in teardown.
  - [x] From a media-shaped handler, calls `pillar('core').settings.set({ key, value })`, `pillar('core').settings.get({ key })`, and `pillar('core').settings.getMany({ keys })`. `ensure`, `delete`, and `setMany` share the same transport + auth + contract code path and are covered by US-01's contract tests; the wire-level proof is not duplicated here.
  - [x] Asserts the returned shapes match the contract types (`SettingsGet*`, `SettingsSet*`, `SettingsGetMany*`).
  - [x] Asserts the per-`pillarId` discovery cache resolves once across back-to-back calls — `CountingDiscoveryTransport` spy; assertion is `fetchCount` unchanged across 4 follow-up procedure calls.
  - [x] Asserts the `unavailable`-pillar discriminant once the core-api server is taken down — the media-shaped handler surfaces a `PillarCallError` with `result.kind === 'unavailable'`. (The PRD prose called the discriminant `'pillar-unavailable'`; the canonical name in `@pops/pillar-sdk/client/errors` is `'unavailable'`.)
- [x] The test runs as part of the standard `pnpm --filter @pops/core-api test` pipeline. CI green required for merge.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Deferred

- The unauthenticated-boot assertion (`PillarServerSdkError` thrown on first call when `POPS_INTERNAL_API_KEY` is unset) is unit-tested in `packages/pillar-sdk/src/server/__tests__/factory.test.ts`. An end-to-end variant that mutates `process.env` mid-suite would race the `beforeAll` fixture and risk leaking the missing-key state into other suites in the same vitest worker — the unit test is the correct home for the fail-closed assertion.

## Notes

- The integration test is the **wire-level proof** that PRD-247's design works end-to-end. Unit-test mocks at the call sites (US-03) and the surface (US-01) are not enough — only the wire test catches transport / auth / contract drift.
- If pops-api already has an integration-test fixture that boots cross-pillar APIs (check `__integration__/` for prior work), piggyback on it. Don't invent a new harness.
- Discovery-cache assertion is the load-bearing one: it catches the regression where every call re-resolves the registry and burns a hot-path budget.
- The unauthenticated-boot case is the security gate. It must fail closed, not silently send unauthenticated traffic.
