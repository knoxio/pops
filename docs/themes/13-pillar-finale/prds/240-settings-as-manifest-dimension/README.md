# PRD-240: Settings as a first-class manifest dimension

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Done**
>
> ADR: [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md)

## Overview

[ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) settles the direction: settings stops being surfaced via a hand-curated SDK barrel and becomes a registry-discovered manifest dimension peer of `searchAdapters` / `aiTools` / `sinks`. This PRD scopes the implementation — manifest schema extension, the `discoverSettings()` SDK helper, the per-pillar manifest contributions, the consumer migration, and the deletion of every static-barrel artefact left behind.

## Background

The hand-curated barrel at `packages/pillar-sdk/src/settings/index.ts` is the last named-export discovery point in the platform. [PRD-239](../239-settings-manifest-physical-relocation/README.md) is moving each per-pillar `SettingsManifest` source out of `@pops/module-registry` into its owning contract package; PRs [#3210](https://github.com/knoxio/pops/pull/3210), [#3207](https://github.com/knoxio/pops/pull/3207), and [#3209](https://github.com/knoxio/pops/pull/3209) all collided on that barrel during their parallel implementation of US-01 / US-03 / US-04. The collision is structural — every pillar US has to edit the same line — and is the load-bearing motivation for this PRD.

PRD-240 deletes the barrel and replaces the discovery contract with a registry walk. Each pillar contributes its `SettingsManifest` via its manifest, the way it already does for the other three dimensions. The six call sites that PR [#3176](https://github.com/knoxio/pops/pull/3176) migrated onto `@pops/pillar-sdk/settings` switch from named imports to `discoverSettings()` lookups.

[PRD-239](../239-settings-manifest-physical-relocation/README.md) US-01 … US-05 (physical relocation of each pillar's manifest source into its contract package) remain prerequisites — PRD-240's manifest contribution per pillar is impossible while the source still lives in `@pops/module-registry`. [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md) (drop the `@pops/module-registry/settings` subpath + `pillar-sdk`'s workspace dep on `@pops/module-registry`) folds into PRD-240's final cleanup US.

## Surface

The change touches four code surfaces, mirroring the PRD-236 sinks scaffold pattern:

| Surface                                                                                   | Change                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pillar-sdk/src/manifest-schema/schema.ts`                                       | Extend `ManifestPayloadSchema` with the optional `settings` dimension carrying a `SettingsManifest` shape. Disambiguate against the existing consumed-keys block. |
| `packages/pillar-sdk/src/settings/index.ts`                                               | Replace named re-exports with `discoverSettings()` — a registry-driven enumerator. Delete the file's re-export body.                                              |
| Per-pillar API package (`apps/pops-api/src/modules/<pillar>/index.ts`)                    | Each pillar's manifest declaration declares its `settings: { manifest: <pillar>Manifest }`. Small, independent touch per pillar.                                  |
| `apps/pops-api/src/modules/{core,inventory,finance,cerebrum,cerebrum/ego,media}/index.ts` | Switch the six call sites from `import { financeManifest }` to a `discoverSettings()` lookup by id.                                                               |

After the migration:

```
@pops/pillar-sdk/manifest-schema   → ManifestPayloadSchema.settings carries SettingsManifest contribution
@pops/pillar-sdk/settings          → discoverSettings({ discovery }) → SettingsManifest[]
apps/pops-api/src/modules/<pillar> → declares settings.manifest on its manifest payload
```

The static barrel is deleted in the final cleanup US, together with `@pops/module-registry/settings` and `pillar-sdk`'s workspace dep on `@pops/module-registry`.

## Business Rules

- **Backwards-compatible schema extension.** The new `settings` block is optional. Pillars that do not contribute a settings UI (today: none; tomorrow: bridges, UI pillars per [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md)) omit it. Existing manifests still parse.
- **One name, one meaning.** The current `settings: { keys: SETTINGS_KEY[] }` block (consumed-settings keys) is renamed to `consumedSettings` so the dimension name `settings` is exclusively the settings UI contribution. The rename is mechanical — call sites are not numerous and the rename happens in US-01.
- **Registry-driven discovery.** `discoverSettings()` reads the live registry snapshot via the injected `discovery` source (the same `discovery` shape `discoverSearchAdapters()` and `publishEvent()` already take). No static imports of pillar manifests survive in `@pops/pillar-sdk/settings`.
- **Pillar ownership.** Each pillar contributes exactly its own settings manifest, declared in its API package's manifest source. No platform file enumerates pillar names. External pillars (PRD-233) follow the same pattern unchanged.
- **One-time consumer migration.** The six `apps/pops-api/src/modules/<pillar>/index.ts` call sites flip from named-imports to `discoverSettings()` + id lookup. Lookup helpers (e.g. a typed `findSettingsManifest(id)` thin wrapper) live in `@pops/pillar-sdk/settings` next to `discoverSettings()`.
- **Folded cleanup.** [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md) and [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) both close in PRD-240 US-05's PR. The legacy subpaths have no consumers once the barrel deletes.

## Edge Cases

| Case                                                                                                         | Behaviour                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two pillars declare a settings manifest with the same `id`                                                   | Manifest validator rejects on the second registration. `discoverSettings()` already trusts ids; duplicates are a registration-time bug, surfaced at boot via the registry's reconcile pass.                                                                               |
| A pillar's manifest is in the registry but `registered=false` (PRD-162 reconcile mid-flight)                 | Skipped by `discoverSettings()` the same way `discoverSearchAdapters()` skips it. Reconcile re-registers; the next call picks the pillar up.                                                                                                                              |
| Consumer asks for a `SettingsManifest` by id that no pillar declares                                         | `discoverSettings().find(m => m.id === '<id>')` returns `undefined`. Caller surfaces a 404 or empty state — same shape as a missing search adapter today.                                                                                                                 |
| Cerebrum / ego nested-manifest case                                                                          | `cerebrumManifest` and `egoManifest` are two separate `SettingsManifest` values — both surface from the cerebrum pillar's manifest declaration as two entries in `settings.manifests[]`. The dimension block is a tuple of manifests, not a single manifest, per ADR-026. |
| Existing `settings: { keys: SETTINGS_KEY[] }` consumers                                                      | Rename to `consumedSettings` in the same PR (US-01). Codegen regenerates types; consumers update mechanically. No semantic change.                                                                                                                                        |
| A pillar's `SettingsManifest` contains circular references (e.g. groups referencing manifest-level metadata) | Out of scope — the existing `SettingsManifest` type is tree-shaped. PRD-240 carries the shape unchanged.                                                                                                                                                                  |
| The serialised manifest payload grows large (cerebrum has 20+ fields across groups)                          | Acceptable. Registry-snapshot caching (PRD-162 TTL) absorbs cost. If profiling reveals an actual issue, a follow-up PRD can introduce lazy fetch — out of scope here.                                                                                                     |
| External pillar (PRD-233 Rust example) contributes a `SettingsManifest`                                      | Works identically to internal pillars: the Rust pillar serialises a `SettingsManifest`-shaped object in its manifest, the discovery walk picks it up.                                                                                                                     |

## User Stories

| #   | Story                                                                                               | Summary                                                                                                                                                                                                                                                                                                                                                                                                  | Parallelisable               |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 01  | [us-01-extend-manifest-schema](us-01-extend-manifest-schema.md)                                     | Extend `ManifestPayloadSchema` with the optional `settings` dimension. Disambiguate the existing consumed-keys block (rename → `consumedSettings`). Update validator + codegen.                                                                                                                                                                                                                          | Yes — foundational           |
| 02  | [us-02-add-discover-settings](us-02-add-discover-settings.md)                                       | Add `discoverSettings({ discovery })` to `@pops/pillar-sdk/settings`. Registry walk, filter by `settings.manifests` non-empty, return `SettingsManifest[]`. Typed lookup helper.                                                                                                                                                                                                                         | Blocked by us-01             |
| 03  | [us-03-pillar-manifest-contributions](us-03-pillar-manifest-contributions.md)                       | Each per-pillar API (`apps/pops-api/src/modules/<pillar>/index.ts`) declares its `SettingsManifest` in its manifest payload. Small touch per pillar, no shared file edit.                                                                                                                                                                                                                                | Yes — five independent edits |
| 04  | [us-04-migrate-consumers](us-04-migrate-consumers.md)                                               | Migrate the six `apps/pops-api/src/modules/<pillar>/index.ts` call sites from named-import (`financeManifest`) to `discoverSettings()` + id lookup.                                                                                                                                                                                                                                                      | Blocked by us-02 + us-03     |
| 05  | [us-05-delete-static-barrels-and-legacy-subpath](us-05-delete-static-barrels-and-legacy-subpath.md) | Delete `packages/pillar-sdk/src/settings/index.ts` (named-export body). Delete `@pops/module-registry/settings` subpath. Drop `pillar-sdk`'s workspace dep on `@pops/module-registry`. Close [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) + [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md) in the same PR. | Blocked by us-04             |

US-01 lays the schema. US-02 and US-03 are mutually independent — US-02 ships the SDK helper without touching pillar code, US-03 ships per-pillar manifest declarations without touching the SDK helper. US-04 (consumer migration) requires both. US-05 deletes the legacy surfaces once nothing reaches into them.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `ManifestPayloadSchema` carries an optional `settings` dimension matching the `SettingsManifest`-shaped contribution; the prior consumed-keys block is renamed to `consumedSettings` and all call sites updated.
- `@pops/pillar-sdk/settings` exports `discoverSettings({ discovery })` and a typed `findSettingsManifest(snapshot, id)` helper; the static named-export body is gone.
- All five owning pillars (`core`, `inventory`, `finance`, `cerebrum`, `media`) declare their `SettingsManifest`s on their manifest payloads. The cerebrum pillar's manifest carries both `cerebrumManifest` and `egoManifest` per [ADR-026](../../../../architecture/adr-026-pillar-architecture.md).
- The six consumers (`apps/pops-api/src/modules/{core,inventory,finance,cerebrum,cerebrum/ego,media}/index.ts`) import nothing from `@pops/pillar-sdk/settings` named exports; they call `discoverSettings()` instead.
- `packages/pillar-sdk/src/settings/index.ts` exports only `discoverSettings` / `findSettingsManifest` (no `aiConfigManifest`, no `financeManifest`, etc.).
- `@pops/module-registry/settings` subpath is deleted; `packages/pillar-sdk/package.json` no longer lists `@pops/module-registry` as a dependency.
- `grep -rn "@pops/module-registry/settings" packages apps` returns zero matches under any `src/` directory.
- `grep -rn "from '@pops/pillar-sdk/settings'" packages apps` shows only `discoverSettings` / `findSettingsManifest` imports (zero named-manifest imports).
- [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) and [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md) are both marked **Done** in their checkboxes and parent PRD tables.
- `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/api typecheck/test`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Reshaping the `SettingsManifest` contract itself.** `SettingsManifest` (in `@pops/types`) stays as-is — same `id`, `title`, `icon`, `order`, `groups[]`, `groups[].fields[]`. Pure surface relocation.
- **A frontend `discoverSettings()` React hook.** Out of scope for this PRD. Likely a small follow-up under [PRD-215](../215-react-sdk/README.md) once the SDK helper lands.
- **Migrating non-`SettingsManifest` named exports** out of any other static SDK barrel (`@pops/pillar-sdk/manifest-schema`, etc.). Only the settings barrel is the subject here; other dimensions already use registry discovery.
- **Splitting `ai` and `ego` into their own contract packages.** Per [PRD-239](../239-settings-manifest-physical-relocation/README.md), they nest under `core` and `cerebrum` respectively. PRD-240 inherits that choice.
- **Retiring `@pops/module-registry` itself.** The package still hosts the runtime install-set shim (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`) — retired separately by [PRD-218](../218-module-registry-deprecation/README.md) US-03. PRD-240 only deletes its `./settings` subpath.

## References

- [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) — the decision this PRD implements
- [ADR-034](../../../../architecture/adr-034-sinks-manifest-dimension.md) — precedent (sinks) for promoting a cross-pillar concern to a manifest dimension
- [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition; settings dimension is descriptive
- [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) — pillar ownership; each pillar owns its contract surface
- [PRD-236](../236-sinks-manifest-dimension/README.md) — sinks scaffold pattern PRD-240 mirrors
- [PRD-238](../238-settings-known-modules-surface/README.md) — prior migration step; closes by PRD-240 US-05
- [PRD-239](../239-settings-manifest-physical-relocation/README.md) — per-pillar physical relocation; load-bearing prerequisite (US-01 … US-05); US-06 folds into PRD-240 US-05
- PR [#3175](https://github.com/knoxio/pops/pull/3175) — scaffolded the static barrel
- PR [#3176](https://github.com/knoxio/pops/pull/3176) — moved the six consumers onto `@pops/pillar-sdk/settings`
- PRs [#3210](https://github.com/knoxio/pops/pull/3210) / [#3207](https://github.com/knoxio/pops/pull/3207) / [#3209](https://github.com/knoxio/pops/pull/3209) — the parallel-merge collision that surfaced the smell
