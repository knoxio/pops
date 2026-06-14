# US-03: Each per-pillar API declares its `SettingsManifest` on its manifest

> PRD: [PRD-240 — Settings as a first-class manifest dimension](README.md)

## Description

As a pillar maintainer, I want my pillar's settings UI contribution to flow through my manifest payload — declared next to my `searchAdapters` / `aiTools` / `sinks` — so that no platform-wide file needs editing when I add or remove a settings manifest.

## Acceptance Criteria

- [ ] Each of the five owning pillar API entry files declares its `settings.manifests` on the manifest payload:
  - `apps/pops-api/src/modules/core/index.ts` → `settings.manifests: [aiConfigManifest, coreOperationalManifest]`
  - `apps/pops-api/src/modules/inventory/index.ts` → `settings.manifests: [inventoryManifest]`
  - `apps/pops-api/src/modules/finance/index.ts` → `settings.manifests: [financeManifest]`
  - `apps/pops-api/src/modules/cerebrum/index.ts` → `settings.manifests: [cerebrumManifest, egoManifest]`
  - `apps/pops-api/src/modules/media/index.ts` → `settings.manifests: [arrManifest, plexManifest, rotationManifest, mediaOperationalManifest]`
- [ ] The source for each `SettingsManifest` value is imported from its owning pillar's contract package's `./settings` subpath (per [PRD-239](../239-settings-manifest-physical-relocation/README.md) US-01 … US-05 relocations). Zero new imports from `@pops/module-registry/settings` or the static `@pops/pillar-sdk/settings` barrel.
- [ ] The contribution validates against the `ManifestPayloadSchema.settings` shape introduced in [US-01](us-01-extend-manifest-schema.md).
- [ ] Each manifest endpoint (`GET /manifest.json` for each pillar's API) serialises the new `settings.manifests` block correctly. A smoke test per pillar parses the JSON and re-validates against the schema.
- [ ] No two pillars contribute manifests with overlapping `id`s. Validator check at boot — duplicate ids surface as a clear error.
- [ ] `pnpm --filter @pops/api typecheck/test` is clean for every affected module.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is **five mutually independent edits** — `core`, `inventory`, `finance`, `cerebrum`, `media`. Each touches one file and only that file. They are merge-friendly by construction (different paths) and can land in any order behind [US-01](us-01-extend-manifest-schema.md).
- The cerebrum case is the only multi-manifest contribution: `cerebrumManifest` + `egoManifest`. Per [ADR-026](../../../../architecture/adr-026-pillar-architecture.md), ego is a sub-domain of cerebrum and the two manifests both belong to the cerebrum pillar's manifest payload.
- The media case is the largest: four manifests in one contribution (`arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest`).
- This US lands the _contributions_. Consumers still read from the legacy `@pops/pillar-sdk/settings` barrel until [US-04](us-04-migrate-consumers.md) flips them. The two surfaces co-exist briefly — `discoverSettings()` returns the manifest from the registry, the named-import barrel returns it directly; both end up at the same `SettingsManifest` value.
- The PRD-239 US-01 … US-05 source relocations are **hard prerequisites** for this US — until each pillar's manifest source lives in its contract package, the per-pillar API has nothing local to import. PRD-239 status table should show all five relocations as Done before US-03 starts.
