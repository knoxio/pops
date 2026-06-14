# US-05: Integration test — synthetic pillar contributes `frontend.captureOverlay`

> PRD: [PRD-245 — Shell + API pillar decoupling](README.md)

## Description

As a shell maintainer, I want an integration test that registers a synthetic in-repo pillar declaring `frontend.captureOverlay` via the registry and asserts the shell mounts that synthetic overlay (not cerebrum's) without any source-file edit. This is the gate that proves the H9 cleanup is registry-driven, not just refactored.

The test mirrors [PRD-243](../243-registry-driven-shell-ui/README.md) US-04's synthetic-pillar mount pattern (introduced in [PR #3243](https://github.com/knoxio/pops/pull/3243)).

## Acceptance Criteria

- [ ] A new integration test in `apps/pops-shell/src/tests/` (sibling to `manifests.test.ts`):
  - Registers a synthetic manifest with a `frontend.captureOverlay` block (`bundleSlot: 'test-overlay'`, `order: 1` — lower than cerebrum's 10, so the synthetic wins selection) via `__setInstalledFrontendManifestsOverride()`.
  - Renders the shell tree containing `CaptureModal`.
  - Asserts the synthetic overlay's bundle slot resolves and mounts; cerebrum's `IngestForm` does NOT mount even though cerebrum's manifest also contributes one.
  - Asserts no `@pops/app-cerebrum` import is reached during the test (verified by mock / spy on the bundle map, not by an import-time assertion).
- [ ] A second test case asserts the empty-modal path: when the registry override returns no manifest with `frontend.captureOverlay`, the modal mounts with an empty content surface and emits the debug-level "no capture overlay registered" log.
- [ ] A third test case asserts the duplicate-hotkey warning path: two synthetic manifests with the same `hotkey` → the lower-`order` overlay binds the hotkey, the higher-`order` overlay does not, and a structured warning naming both pillar ids is emitted.
- [ ] The test relies only on `installedFrontendManifests()` (or whichever surface US-03 exposes) — no per-pillar named imports.
- [ ] `pnpm --filter @pops/shell test` is clean. CI runs the test in the standard shell test suite (no new workflow file).
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is blocked by US-03 (the shell rewrite). US-02 is not strictly required — the synthetic pillar in the test fixture stands in for cerebrum — but in practice US-02 will land alongside US-03.
- The test pattern is lifted from [PRD-243](../243-registry-driven-shell-ui/README.md) US-04's `manifests.test.ts` migration (commit 82a23d6b). Re-read that test as the template.
- The `__setInstalledFrontendManifestsOverride()` hook PRD-243 introduced is the reuse point. PRD-245 does not introduce a separate override surface for capture overlays.
- The bundle-map spy / mock approach matters because TypeScript's static analysis sees `@pops/app-cerebrum` referenced from the bundle map regardless of runtime selection. The test asserts the runtime path, not the static graph.
