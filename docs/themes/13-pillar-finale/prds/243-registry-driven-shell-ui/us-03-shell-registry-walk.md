# US-03: Rewrite shell `installed-modules.ts` + `nav/registry.ts` as a registry walk

> PRD: [PRD-243 — Registry-driven shell UI aggregation](README.md)

## Description

As the shell, I want to derive my installed-modules and app-rail registry from a single registry walk over each pillar's `nav` and `pages` contributions, so adding or removing a pillar does not require a shell-side source edit.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/installed-modules.ts` no longer imports any `@pops/app-*` or `@pops/overlay-*` package by name. The `KNOWN_FRONTEND_MANIFESTS` literal is deleted.
- [ ] `apps/pops-shell/src/app/nav/registry.ts` no longer imports any `@pops/app-*` `navConfig` by name. The `registeredApps` literal is deleted.
- [ ] A single workspace bundle map lives in one source file (e.g. `apps/pops-shell/src/app/bundle-map.ts`): an object literal `{ <pillarId>: () => import('@pops/app-<id>') }`. This is the only file in the shell that enumerates in-repo pillar ids.
- [ ] `installedFrontendManifests()` walks the registry snapshot, joins each pillar's manifest with the workspace bundle map, and returns the `FrontendManifest[]` shape today's consumers expect. Backend-only pillars (no `nav` and no `pages`) are filtered out.
- [ ] `installedAppManifests()` filters to pillars with at least one `PageDescriptor` resolvable through the bundle map — preserving today's `surfaces.includes('app') && hasRoutes()` semantics.
- [ ] `registeredApps` (or its replacement) is derived from the registry walk, sorted by `nav.order` ascending with a stable lexicographic tiebreak on `nav.id`. Today's display order (`finance, media, inventory, food, lists, cerebrum, ai`) is preserved by construction.
- [ ] A pillar whose id is in the registry but absent from the workspace bundle map is logged once (`unknown UI pillar id; skipping mount`) and skipped — the shell does not crash. Today this path stays inert because every registered pillar id is in the map.
- [ ] The existing test override surface (`__setInstalledFrontendManifestsOverride()` / `__resetInstalledFrontendManifestsOverride()`) keeps working; it now overrides the joined output rather than the raw `KNOWN_FRONTEND_MANIFESTS` literal.
- [ ] `apps/pops-shell/src/app/installed-modules.test.ts` and `apps/pops-shell/src/app/nav/registry.test.ts` pass.
- [ ] `pnpm --filter @pops/shell typecheck/test/build` is clean. Visual / behaviour parity: app rail renders the same seven entries in the same order before vs after.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The workspace bundle map is the lone seam where the shell still names in-repo pillar ids. It exists because in-repo bundles are statically importable; once US-05's external-loading mechanism lands, the map either grows a runtime fallback path or is itself derived from the registry's `assetsBaseUrl`.
- Capture-modal coupling (audit H9) is _not_ in scope here; the `CaptureModal` import path stays. Treat any cleanup of that surface as a separate PRD.
- For pillars that ship overlays only (`ego`), the registry walk continues to surface them via whatever overlay dimension exists today — this US does not migrate overlays.
- The discovery source the registry walk reads is the same source `discoverSettings()` / `discoverSearchAdapters()` use; no new fetcher. The shell already participates in the registry per PR [#3138](https://github.com/knoxio/pops/pull/3138).
- Keep the change diff-isolated to the shell + the workspace bundle map; per-pillar manifest contributions are US-02 territory.
