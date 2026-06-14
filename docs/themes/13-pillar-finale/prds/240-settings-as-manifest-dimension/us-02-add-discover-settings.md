# US-02: Add `discoverSettings()` to `@pops/pillar-sdk/settings`

> PRD: [PRD-240 — Settings as a first-class manifest dimension](README.md)

## Description

As a settings UI consumer (`apps/pops-api`, `apps/pops-shell`, an external pillar's admin UI), I want a single registry-driven discovery call that returns every pillar's settings manifest contributions so that I can render the settings tree without naming pillars at the import site.

## Acceptance Criteria

- [ ] `@pops/pillar-sdk/settings` exports `discoverSettings({ discovery })` — async function returning `Promise<SettingsManifest[]>`.
- [ ] `discovery` is the same shape `discoverSearchAdapters()` and `publishEvent()` accept (`DiscoverySnapshot | () => Promise<DiscoverySnapshot>`). The helper does not own discovery; it consumes it.
- [ ] The walk iterates pillars in the snapshot, filters to `pillar.manifest.settings?.manifests?.length > 0`, flattens the contributions, and returns them ordered by `(pillar.id, manifest.order, manifest.id)` for deterministic UI rendering.
- [ ] Pillars whose registry entry has `registered: false` are skipped (mirroring `discoverSearchAdapters()` and `publishEvent()` behaviour).
- [ ] A typed helper `findSettingsManifest(manifests, id): SettingsManifest | undefined` is exported alongside `discoverSettings()` — the named-import replacement consumers use to look up a specific manifest (`findSettingsManifest(await discoverSettings({ discovery }), 'finance')`).
- [ ] Vitest covers: empty registry → `[]`; one pillar contributing one manifest; one pillar contributing two manifests (cerebrum + ego); ordering across pillars; skip of unregistered pillar; missing `settings` block treated as no contribution; `findSettingsManifest` returns `undefined` for unknown ids.
- [ ] JSDoc on `discoverSettings()` documents at-time-of-call discovery semantics (matches `discoverSearchAdapters()` JSDoc shape).
- [ ] `packages/pillar-sdk/src/settings/index.ts` exposes only `discoverSettings` + `findSettingsManifest`. The named-export body (e.g. `export { financeManifest }`) is **removed** in US-05's cleanup, not here — this US adds the new surface without yet deleting the legacy one, so consumers can migrate in US-04 without a hard cutover.
- [ ] `pnpm --filter @pops/pillar-sdk typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Mirror `packages/pillar-sdk/src/search-orchestrator/discover-search-adapters.ts` (or the equivalent `discoverSinks` helper from [PRD-236](../236-sinks-manifest-dimension/README.md) US-03) for the iteration shape — the goal is one-to-one structural similarity with the other dimensions.
- The "find by id" pattern is what replaces named imports. Document the `findSettingsManifest` helper with the migration example inline so consumers in US-04 have a single pattern to copy.
- `SettingsManifest` is imported from `@pops/types`; the SDK helper consumes the same type the contributors produce. No new public type is introduced.
- Per [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md), this US lands the discovery surface alongside the still-extant static barrel. The legacy export body is left in place until US-05 — that means tests in this US assert the new surface only; consumer behaviour stays unchanged through US-03 + US-04.
