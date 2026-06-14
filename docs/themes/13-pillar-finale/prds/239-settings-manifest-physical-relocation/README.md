# PRD-239: Settings-manifest physical relocation to per-pillar packages

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **In progress — US-01 / US-03 / US-04 / US-05 done; US-02 in flight; US-06 deferred → folds into [PRD-240 US-05](../240-settings-as-manifest-dimension/us-05-delete-static-barrels-and-legacy-subpath.md)**

## Status note (2026-06-14, post-ADR-037)

[ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) promotes settings to a first-class manifest dimension. The per-pillar source relocations US-01 … US-05 remain **load-bearing prerequisites** for [PRD-240](../240-settings-as-manifest-dimension/README.md) — each pillar's manifest source must live in its owning contract package before the pillar can declare it on the new manifest dimension. US-06 (drop the legacy subpath + `pillar-sdk`'s `@pops/module-registry` workspace dep) **defers** — it folds into [PRD-240 US-05](../240-settings-as-manifest-dimension/us-05-delete-static-barrels-and-legacy-subpath.md)'s combined cleanup, which deletes the legacy subpath, the static SDK barrel, and the workspace dep together with closing US-06 here and [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md). Do not start US-06 in isolation — its work happens inside PRD-240 US-05's PR.

The parallel-merge collision that surfaced the underlying architectural smell was real: PRs [#3210](https://github.com/knoxio/pops/pull/3210), [#3207](https://github.com/knoxio/pops/pull/3207), [#3209](https://github.com/knoxio/pops/pull/3209) all conflicted on `packages/pillar-sdk/src/settings/index.ts` while landing US-01 / US-03 / US-04 in parallel. That collision file goes away inside PRD-240 US-05.

## Overview

The ten per-pillar `SettingsManifest` exports (`aiConfigManifest`, `coreOperationalManifest`, `inventoryManifest`, `financeManifest`, `cerebrumManifest`, `egoManifest`, `arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest`) still physically live under `packages/module-registry/src/settings/`. This PRD moves each manifest's source into its owning pillar's contract package, re-points `@pops/pillar-sdk/settings` at the per-pillar barrels, and deletes the `@pops/module-registry/settings` subpath. The deliverable is a pure relocation — no shape change, no rename, no contents change.

## Background

The two adjacent PRs landed the indirection layer:

- **PR [#3175](https://github.com/knoxio/pops/pull/3175)** scaffolded `packages/pillar-sdk/src/settings/index.ts`, which re-exports the ten manifests from `@pops/module-registry/settings`. The `./settings` subpath was added to `pillar-sdk`'s `exports` map and a workspace dep on `@pops/module-registry` was added to `pillar-sdk`.
- **PR [#3176](https://github.com/knoxio/pops/pull/3176)** migrated the eight `apps/pops-api` consumers off `@pops/module-registry/settings` and onto `@pops/pillar-sdk/settings` (PRD-238 US-01, Option B).

[PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) — drop the `@pops/module-registry/settings` subpath — was deferred because `pillar-sdk/settings` still re-exports from there. Deleting the subpath today self-breaks the SDK barrel.

The unblock is physical relocation: each manifest's source file moves out of `module-registry` into its owning pillar's contract package; `pillar-sdk/settings` then re-exports from the per-pillar packages; the legacy subpath has zero remaining consumers and can be deleted. That is the work this PRD specifies.

## Target homes

The ten manifests partition into five pillars. Each manifest moves to its owning pillar's contract package:

| Manifest                   | Today's source                                                        | Target package                                                                                                           |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `aiConfigManifest`         | `packages/module-registry/src/settings/core/ai-manifest.ts`           | `@pops/core-contract` (sub-barrel `./settings`)                                                                          |
| `coreOperationalManifest`  | `packages/module-registry/src/settings/core/operational-manifest.ts`  | `@pops/core-contract` (sub-barrel `./settings`)                                                                          |
| `inventoryManifest`        | `packages/module-registry/src/settings/inventory/index.ts`            | `@pops/inventory-contract` (sub-barrel `./settings`)                                                                     |
| `financeManifest`          | `packages/module-registry/src/settings/finance/index.ts`              | `@pops/finance-contract` (sub-barrel `./settings`)                                                                       |
| `cerebrumManifest`         | `packages/module-registry/src/settings/cerebrum/**`                   | `@pops/cerebrum-contract` (sub-barrel `./settings`) — includes the group sub-files                                       |
| `egoManifest`              | `packages/module-registry/src/settings/ego/index.ts`                  | `@pops/cerebrum-contract` (sub-manifest under the cerebrum settings barrel; per ADR-026 ego is a sub-domain of cerebrum) |
| `arrManifest`              | `packages/module-registry/src/settings/media/manifests.ts`            | `@pops/media-contract` (sub-barrel `./settings`)                                                                         |
| `plexManifest`             | `packages/module-registry/src/settings/media/manifests.ts`            | `@pops/media-contract` (sub-barrel `./settings`)                                                                         |
| `rotationManifest`         | `packages/module-registry/src/settings/media/manifests.ts`            | `@pops/media-contract` (sub-barrel `./settings`)                                                                         |
| `mediaOperationalManifest` | `packages/module-registry/src/settings/media/operational-manifest.ts` | `@pops/media-contract` (sub-barrel `./settings`)                                                                         |

Each target package gains a `./settings` subpath in its `exports` map. `aiConfigManifest` parks on `@pops/core-contract` for the same ADR-026 reasoning that places `egoManifest` under cerebrum — `ai` is a sub-domain of `core` today; a future split into a dedicated `@pops/ai-contract` is a non-goal here.

## API Surface

After relocation, the import graph is:

```
@pops/core-contract/settings        →  aiConfigManifest, coreOperationalManifest
@pops/inventory-contract/settings   →  inventoryManifest
@pops/finance-contract/settings     →  financeManifest
@pops/cerebrum-contract/settings    →  cerebrumManifest, egoManifest
@pops/media-contract/settings       →  arrManifest, plexManifest, rotationManifest, mediaOperationalManifest

@pops/pillar-sdk/settings           →  re-exports all 10 from the per-pillar barrels above
```

Consumers continue to import from `@pops/pillar-sdk/settings` — the eight call sites flipped by PR #3176 do not move again. The relocation is invisible to them.

## Business Rules

- **Pure physical move.** File contents, `SettingsManifest` shape, export names, and `id` / `title` / `icon` / `order` fields are unchanged. Diff per move is one source file relocated + import paths within that file repointed at the new package's neighbours.
- **No new public surface.** Each pillar contract package adds exactly one new subpath: `./settings`. Nothing else moves.
- **`pillar-sdk/settings` re-export shape stays identical.** Same named exports, same order. Only the internal import specifiers change (from `@pops/module-registry/settings` to the five per-pillar `./settings` subpaths).
- **`@pops/module-registry/settings` deletes once all five pillar moves have shipped.** The final US owns the delete and closes [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) in the same PR.
- **`pillar-sdk` drops its workspace dep on `@pops/module-registry`** as part of the final US, once the SDK no longer re-exports from there.
- **Tests are smoke-only.** Each pillar US adds (or extends) a one-line import-and-assert test inside the receiving package proving the manifest still loads with the same `id`. Manifest contents are not under test in this PRD.

## Edge Cases

| Case                                                                                                                                         | Behaviour                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cerebrum manifest is split across four files (`subsystem-manifest.ts`, `query-emit-manifest.ts`, `retrieval-ingest-manifest.ts`, `index.ts`) | Move the whole `cerebrum/` directory as a unit into `packages/cerebrum-contract/src/settings/`. The internal relative imports stay valid because the directory moves together.                                                                                         |
| `ai-manifest.test.ts` lives next to `core/ai-manifest.ts`                                                                                    | The test moves with the source into `@pops/core-contract` (placed under that package's existing test layout — alongside the manifest file or under `__tests__`, whichever matches the package's convention).                                                           |
| A pillar contract package doesn't have a `./settings` subpath in `exports` yet                                                               | The pillar US adds it (TS source + `package.json` exports entry + matching `dist` paths). Mirrors the existing pattern (`./types`, `./schemas`).                                                                                                                       |
| `pillar-sdk/settings/index.ts` would form a circular dep through any per-pillar package                                                      | Should not happen — pillar contract packages do not depend on `pillar-sdk`. If a circle does appear during implementation, surface it on the US and pause the merge; the relocation choice for that pillar is wrong.                                                   |
| Build-time consumer (`scripts/known-modules.ts` inside `module-registry`) reads a manifest                                                   | That script is internal to `module-registry` and falls under [PRD-218](../218-module-registry-deprecation/README.md) US-03's package-deletion finishing move. Out of scope for this PRD — `module-registry`'s internal consumers go away with the package, not before. |
| Docstring references to `@pops/module-registry/settings` in `apps/pops-api`                                                                  | Already handled by [PRD-238 US-01](../238-settings-known-modules-surface/us-01-pick-target-and-migrate.md). No new docstring sweep needed here.                                                                                                                        |

## User Stories

| #   | Story                                                                     | Summary                                                                                                                                                               | Parallelisable           |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 01  | [us-01-relocate-core-manifests](us-01-relocate-core-manifests.md)         | Move `aiConfigManifest` + `coreOperationalManifest` into `@pops/core-contract/settings`. Repoint `pillar-sdk/settings` for those two named exports.                   | Yes                      |
| 02  | [us-02-relocate-inventory-manifest](us-02-relocate-inventory-manifest.md) | Move `inventoryManifest` into `@pops/inventory-contract/settings`. Repoint `pillar-sdk/settings` for that one named export.                                           | Yes                      |
| 03  | [us-03-relocate-finance-manifest](us-03-relocate-finance-manifest.md)     | Move `financeManifest` into `@pops/finance-contract/settings`. Repoint `pillar-sdk/settings` for that one named export.                                               | Yes                      |
| 04  | [us-04-relocate-cerebrum-manifests](us-04-relocate-cerebrum-manifests.md) | Move `cerebrumManifest` (and its four sub-files) + `egoManifest` into `@pops/cerebrum-contract/settings`. Repoint `pillar-sdk/settings`.                              | Yes                      |
| 05  | [us-05-relocate-media-manifests](us-05-relocate-media-manifests.md)       | Move `arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest` into `@pops/media-contract/settings`. Repoint `pillar-sdk/settings`.               | Yes                      |
| 06  | [us-06-drop-legacy-subpath](us-06-drop-legacy-subpath.md)                 | Delete `packages/module-registry/src/settings/` + `./settings` exports entry. Drop `pillar-sdk`'s `@pops/module-registry` workspace dep. Close PRD-238 US-02 as Done. | Blocked by us-01 … us-05 |

US-01 … US-05 are mutually independent — each touches one source directory in `module-registry`, one target contract package, and the same `pillar-sdk/settings/index.ts` for its own re-exports (the SDK barrel is mechanically conflict-resolvable as a single line per manifest). US-06 cannot start until all five have merged.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- All ten manifests' source files live in their owning pillar contract package's `src/settings/` directory.
- Each receiving contract package exposes a `./settings` subpath in its `exports` map, with corresponding `dist` paths.
- `@pops/pillar-sdk/settings/index.ts` re-exports all ten manifests from the per-pillar packages — zero references to `@pops/module-registry`.
- `packages/pillar-sdk/package.json` no longer lists `@pops/module-registry` as a workspace dependency.
- `packages/module-registry/src/settings/` is deleted; the `./settings` entry is removed from `packages/module-registry/package.json`'s `exports`.
- `grep -rn "@pops/module-registry/settings" packages apps` returns zero matches under `src/`.
- [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) is marked Done by the final US's PR.
- `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/core-contract …`, `…/inventory-contract`, `…/finance-contract`, `…/cerebrum-contract`, `…/media-contract`, `…/module-registry`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Changing any manifest's contents** — `id`, `title`, `icon`, `order`, `groups`, or any field inside them. Pure relocation.
- **Renaming the manifest exports** — `aiConfigManifest` stays `aiConfigManifest`. No `aiManifest`, no `coreAiManifest`.
- **Changing the `SettingsManifest` contract shape** in `@pops/types`.
- **Splitting `ai` out of `core` into its own `@pops/ai-contract` package.** Mentioned as a future possibility; not part of this PRD.
- **Retiring `@pops/module-registry` itself.** This PRD removes the `./settings` subpath; the package's runtime install-set shim (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`) and the package-deletion finishing move belong to [PRD-218](../218-module-registry-deprecation/README.md) US-03.
- **Touching `apps/pops-shell` or `apps/pops-api` consumer code.** The eight call sites already import from `@pops/pillar-sdk/settings` after PR #3176; the SDK barrel's internal re-exports change, the public surface does not.
- **Adding a `./settings` export to any pillar contract package that doesn't host a manifest** (e.g. `@pops/food-contract`, `@pops/lists-contract`).

## References

- PR [#3175](https://github.com/knoxio/pops/pull/3175) — scaffolded `@pops/pillar-sdk/settings` re-exporting from `@pops/module-registry/settings`.
- PR [#3176](https://github.com/knoxio/pops/pull/3176) — migrated the eight `apps/pops-api` consumers onto `@pops/pillar-sdk/settings` (PRD-238 US-01, Option B).
- PR [#3171](https://github.com/knoxio/pops/pull/3171) — scaffolded PRD-238 (settings-imports-off-module-registry).
- [PRD-238](../238-settings-known-modules-surface/README.md) — parent migration tracker. This PRD unblocks its US-02.
- [PRD-218](../218-module-registry-deprecation/README.md) — `@pops/module-registry` deprecation tracker; US-03 retires the runtime shim consumers and the package itself.
- [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) — pillar ownership model that motivates parking `egoManifest` under cerebrum and `aiConfigManifest` under core.
