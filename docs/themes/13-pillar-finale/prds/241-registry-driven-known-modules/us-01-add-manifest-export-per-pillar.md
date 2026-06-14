# US-01: Each pillar's contract package exposes a `./manifest` export

> PRD: [PRD-241 — Registry-driven `known-modules`](README.md)

## Description

As a pillar maintainer, I want my pillar's `ModuleManifest` to live in my contract package's `./manifest` subpath — next to my settings source and search-adapter contributions — so that the platform registry can discover it via convention instead of hand-curating it in a central file.

## Acceptance Criteria

- [ ] Every pillar currently enumerated in `packages/module-registry/scripts/known-modules.ts`'s `MANIFEST_SOURCES` exposes a `./manifest` export on its owning contract package:
  - `@pops/core-contract/manifest` — `ModuleManifest` for `core`: `id: 'core'`, `name: 'Core'`, `version`, `surfaces: ['app']`, `description`, `settings: [aiConfigManifest, coreOperationalManifest]` (the settings carry through from PRD-239 / PRD-240 already).
  - `@pops/finance-contract/manifest` — `ModuleManifest` for `finance`: full fields as currently inlined in `MANIFEST_SOURCES`.
  - `@pops/food-contract/manifest` — `ModuleManifest` for `food`: `id`, `name`, `version`, `surfaces`, `description`. No settings (matches today).
  - `@pops/lists-contract/manifest` — `ModuleManifest` for `lists`: `id`, `name`, `version`, `surfaces`, `description`. No settings (matches today).
  - `@pops/media-contract/manifest` — `ModuleManifest` for `media`: full fields including `settings: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest]`.
  - `@pops/inventory-contract/manifest` — `ModuleManifest` for `inventory`: full fields including `settings: [inventoryManifest]`.
  - `@pops/cerebrum-contract/manifest` — `ModuleManifest` for `cerebrum`: full fields including `settings: [cerebrumManifest]`.
- [ ] `ai` and `ego` get explicit homes:
  - `ai` ships as a sub-manifest from `@pops/core-contract` (its settings already nest under core per [PRD-239](../239-settings-manifest-physical-relocation/README.md)) — `@pops/core-contract/manifest` exports both `coreManifest` and `aiManifest` as `ModuleManifest`s.
  - `ego` ships as a sub-manifest from `@pops/cerebrum-contract` — `@pops/cerebrum-contract/manifest` exports both `cerebrumManifest` and `egoManifest` as `ModuleManifest`s (mirrors the cerebrum/ego settings nesting from PRD-240).
- [ ] Each `./manifest` export validates against `assertModuleManifest()` (the same validator `scripts/build.ts` already runs). Unit tests per contract package parse + validate the export.
- [ ] Each contract package's `package.json` exposes the `./manifest` subpath under `exports` with both `types` and `default` entries. The `dist/manifest.{d.ts,js}` artefacts are produced by the contract package's existing build step.
- [ ] The fields each export carries are **identical** to the current `MANIFEST_SOURCES` literal entry — same `id`, `name`, `version`, `surfaces`, `description`, `settings`, and (for `ego`) `frontend.overlay`. No drift. The PR description includes a side-by-side diff of each entry.
- [ ] `pnpm --filter @pops/<id>-contract typecheck/test/build` is clean for every affected package.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is **N mutually-independent edits** — one per contract package. They share no files. Land them in parallel behind the PRD-239 / PRD-240 prerequisites.
- The `food-contracts` (plural) legacy package is **not** the home for `food`'s manifest. `@pops/food-contract` (singular) is. The plural variant is a pre-rename leftover that this US does not touch.
- The `core` contract package may need its `package.json` `exports` map extended if `./manifest` is not yet present — same pattern as the existing `./settings` subpath.
- The `egoManifest` `frontend.overlay` block (`chromeSlot: 'assistant'`, `shortcut: 'mod+i'`) carries through verbatim. Do not re-encode the shortcut elsewhere.
- This US lands the **exports**. `MANIFEST_SOURCES` still references its in-place imports until [US-02](us-02-workspace-discovery-build-step.md) flips the build script. The two surfaces co-exist briefly — the literal still works, the export is also valid; both resolve to the same `ModuleManifest` values.
- The [PRD-239](../239-settings-manifest-physical-relocation/README.md) per-pillar relocations are a **hard prerequisite** — until each pillar's settings manifest sources live in its contract package, the `./manifest` export has nothing local to reference. PRD-239 status should show all five relocations as Done before US-01 ends.
