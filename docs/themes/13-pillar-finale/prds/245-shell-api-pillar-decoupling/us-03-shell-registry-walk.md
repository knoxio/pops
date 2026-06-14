# US-03: Rewrite `CaptureModal.tsx` against the registry walk

> PRD: [PRD-245 — Shell + API pillar decoupling](README.md)

## Description

As a shell maintainer, I want `apps/pops-shell/src/app/capture/CaptureModal.tsx` to discover the active capture overlay through a registry walk over the `frontend.captureOverlay` manifest dimension instead of hard-importing cerebrum's `IngestForm` and `useIngestPageModel` from `@pops/app-cerebrum`. This closes audit finding H9.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/capture/CaptureModal.tsx` imports zero `@pops/app-*` packages by name. The two existing imports (`IngestForm`, `useIngestPageModel` from `@pops/app-cerebrum`) are gone.
- [ ] The active overlay is derived from `installedFrontendManifests()` (the [PRD-243](../243-registry-driven-shell-ui/README.md) US-03 registry-walk surface) projected onto the `frontend.captureOverlay` dimension. Selection rule:
  - Filter manifests whose `frontend.captureOverlay` is defined.
  - Sort ascending by `frontend.captureOverlay.order`, ties broken alphabetically by manifest pillar id.
  - Pick the head element. The shell mounts at most one overlay at a time.
- [ ] The descriptor's `bundleSlot` resolves through the workspace bundle map [PRD-243](../243-registry-driven-shell-ui/README.md) US-03 introduced (`{ pillarId: () => import('@pops/app-<id>') }`). Add a `captureOverlay` mapping to that map's contract OR add a thin per-pillar export the shell calls into; pick whichever fits the bundle-map shape already merged in PRD-243 US-03.
- [ ] The descriptor's `hotkey` (if present) is bound at mount time and unbound at unmount. Duplicate hotkey across multiple registered overlays logs a structured warning naming the conflicting pillars; the inactive overlay's hotkey is not bound.
- [ ] When no pillar contributes `frontend.captureOverlay` (e.g. `POPS_APPS` excludes cerebrum and no other pillar declared one), the modal mounts with an empty content surface and logs a debug-level "no capture overlay registered" message. No crash, no build break.
- [ ] When a pillar declares `frontend.captureOverlay` with a `bundleSlot` the workspace bundle map cannot resolve, the shell logs a structured warning (`unknown capture overlay bundleSlot; skipping mount`) and falls back to the empty-modal path. Mirrors [PRD-243](../243-registry-driven-shell-ui/README.md) US-03's `pages` resolution edge case.
- [ ] `pnpm --filter @pops/shell typecheck/test/build` is clean.
- [ ] The full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is blocked by US-01 (schema) + US-02 (at least one pillar contributes the dimension so the walk has something to mount).
- The integration test for the registry-driven path lands under US-05 with a synthetic-pillar fixture; US-03's own unit tests cover the selection rule + the bundle-map resolution edge cases.
- The cerebrum `useIngestPageModel` hook is the call-site's runtime state. After the rewrite the hook lives behind the dynamic-imported `IngestForm` bundle — the shell no longer reaches into it directly. If the hook is exported separately from the React component, the workspace bundle map should expose both under the same `bundleSlot`.
- The `__setInstalledFrontendManifestsOverride()` test hook ([PRD-243](../243-registry-driven-shell-ui/README.md) US-03) is the same hook US-05's integration test uses.
