# US-04: Integration test — register an in-repo pillar, assert shell mounts it from the registry

> PRD: [PRD-243 — Registry-driven shell UI aggregation](README.md)

## Description

As a release engineer, I want an integration test that registers a synthetic in-repo pillar into the registry and asserts the shell mounts its nav entry and routes through the registry walk — proving the shell no longer needs a source edit to mount a new pillar.

## Acceptance Criteria

- [ ] A new integration test in `apps/pops-shell/src/tests/` registers a synthetic pillar (id: `testfixture` or similar) into the registry with a `nav` block and a `pages` block.
- [ ] The synthetic pillar's `bundleSlot` value resolves through the workspace bundle map to a small fixture component (e.g. `<div data-testid="testfixture-mount">ok</div>`).
- [ ] The test boots the shell against an in-memory registry snapshot containing the synthetic pillar plus the in-repo pillars.
- [ ] Assertion 1: the app rail renders an entry for `testfixture` in `nav.order` position relative to the in-repo pillars.
- [ ] Assertion 2: navigating to the synthetic pillar's `basePath` renders the fixture component (proves the workspace bundle map + registry walk wire end-to-end).
- [ ] Assertion 3: removing the synthetic pillar from the registry snapshot and re-running the boot produces an app rail without that entry — no source change required.
- [ ] `apps/pops-shell/src/tests/manifests.test.ts` (audit finding M7) is migrated to derive its iteration from `installedFrontendManifests()` (or a registry-driven helper) instead of per-pillar named imports.
- [ ] `pnpm --filter @pops/shell test` passes.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The synthetic pillar id must avoid collision with any real in-repo pillar id; pick a name that obviously signals fixture status (`testfixture`, `__synthetic_ui_pillar__`).
- The workspace bundle map needs a fixture entry for the synthetic pillar; gating that entry under a test-only branch keeps it out of production bundles. Alternative: extend the test override surface to inject a one-off bundle resolver alongside the manifest list.
- The third assertion ("removing the pillar from the registry") is the load-bearing one: it proves the registry walk is the single source of truth, not a literal array.
- Audit finding M7 in [`notes/pillar-isolation-audit.md`](../../notes/pillar-isolation-audit.md) calls out `apps/pops-shell/src/tests/manifests.test.ts` as the same shape as H4 — migrating it under US-04 closes that finding alongside the main rewrite.
