# US-04: End-to-end integration test for `pillar('core').settings.*` cross-pillar reads + writes

> PRD: [PRD-247 — core.settings.\* cross-pillar SDK surface](README.md)

## Description

As an operator, I want a single integration test that boots `pops-core-api` + `pops-api` (or the in-process equivalents that share the same transport seam) and exercises the cross-pillar settings surface end-to-end, so a regression in transport, auth, contract, or discovery is caught at CI time rather than during a Plex sync failure.

## Acceptance Criteria

- [ ] A test under `apps/pops-api/src/__integration__/` (or the established cross-pillar integration test home) that:
  - [ ] Boots `pops-core-api` (or its in-process router) and the pops-api host registry.
  - [ ] Configures `POPS_INTERNAL_API_KEY` via fixture.
  - [ ] From a media-pillar handler, calls `pillar('core').settings.set({ key, value })`, `pillar('core').settings.get({ key })`, `pillar('core').settings.getMany({ keys })`, `pillar('core').settings.setMany({ entries })`, `pillar('core').settings.ensure({ key, value })`, `pillar('core').settings.delete({ key })`.
  - [ ] Asserts the returned shapes match the contract types.
  - [ ] Asserts the per-`pillarId` discovery-cache resolves once across multiple back-to-back calls (count discovery requests via a transport spy).
  - [ ] Asserts `pillar('core').settings.get(...)` throws `PillarCallError` with `kind: 'pillar-unavailable'` when the core-api endpoint is taken down (or its discovery handle invalidated).
  - [ ] Asserts unauthenticated boot (no `POPS_INTERNAL_API_KEY`) throws `PillarServerSdkError` on first call.
- [ ] The test runs as part of the standard `pnpm --filter @pops/pops-api test` pipeline. CI green required for merge.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The integration test is the **wire-level proof** that PRD-247's design works end-to-end. Unit-test mocks at the call sites (US-03) and the surface (US-01) are not enough — only the wire test catches transport / auth / contract drift.
- If pops-api already has an integration-test fixture that boots cross-pillar APIs (check `__integration__/` for prior work), piggyback on it. Don't invent a new harness.
- Discovery-cache assertion is the load-bearing one: it catches the regression where every call re-resolves the registry and burns a hot-path budget.
- The unauthenticated-boot case is the security gate. It must fail closed, not silently send unauthenticated traffic.
