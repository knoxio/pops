# PRD-238: Settings-imports migration off `@pops/module-registry`

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Blocked — target exports missing**

## Status note (2026-06-14)

US-01 cannot proceed as written. Both candidate migration targets are unavailable today:

- **Option A (per-pillar packages)** — no `@pops/pillar-core`, `@pops/pillar-media`, `@pops/pillar-cerebrum`, `@pops/pillar-inventory`, or `@pops/pillar-finance` package exists under `packages/`. Only `@pops/pillar-sdk` is published. The per-pillar contract packages (`@pops/<pillar>-contract`) exist but do not export `SettingsManifest` values.
- **Option B (`@pops/pillar-sdk/settings`)** — `packages/pillar-sdk/src` has no `settings/` subpath and no `Manifest` exports today. The precedent (PR #3090) only added `ALL_MODULE_IDS` / `isKnownPillarId` / `isModuleId`; it did not introduce a settings surface.

The per-pillar `SettingsManifest` values currently live only in `@pops/module-registry/src/settings/{core,inventory,finance,cerebrum,ego,media}/...` and are re-exported through `@pops/module-registry/settings`. Flipping the 8 consumers requires the target exports to exist first.

**Prerequisite work** before this PRD can resume:

1. Pick the target (decision is still A vs B per the original PRD).
2. Land that target as its own PR — for Option B, scaffold `packages/pillar-sdk/src/settings/` with the 10 manifest re-exports (`aiConfigManifest`, `coreOperationalManifest`, `inventoryManifest`, `financeManifest`, `cerebrumManifest`, `egoManifest`, `arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest`) sourced from the canonical files in `@pops/module-registry/src/settings/**`, add the `./settings` export in `pillar-sdk/package.json`, extend the import-discipline allow-list in `eslint-config-pops`. For Option A, the same work multiplied by N new pillar packages.
3. Then re-run US-01 to flip the 8 consumers.
4. US-02 (delete `@pops/module-registry/settings`) follows unchanged.

This PR records the block; no consumer changes ship in it.

## Overview

[PRD-218](../218-module-registry-deprecation/README.md) US-02 shipped the runtime install-set shim (`INSTALLED_MODULES` / `isInstalledModule`) and migrated every consumer whose semantics match "is this module live on this deploy?". Eight call sites in `apps/pops-api` were explicitly **deferred** because they load per-pillar `SettingsManifest` exports from `@pops/module-registry/settings` (or only reference the package in docstrings). That surface is a settings/manifest loading concern, not an install-set concern, and needs its own home before the legacy package can be fully retired. This PRD covers that migration.

## Background

The deferral was called out in PR #3137 (PRD-218 US-02 batch 3 closeout):

> The 6 `@pops/module-registry/settings` imports (`apps/pops-api/src/modules/{core,inventory,finance,cerebrum,cerebrum/ego,media}/index.ts`) are left in place. They load per-pillar `SettingsManifest` exports, which is a distinct concern from the install-set shim — purely a settings/manifest loading pattern. Consolidating the settings surface (probably onto `@pops/pillar-sdk` or a dedicated `@pops/settings` package) belongs to a separate PRD; tracked as follow-up.

PR #3126's "remaining for batch 3" list paired those 6 import sites with 2 additional files (`modules/manifests.ts`, `modules/core/uri/resolver.ts`) whose only reference to `@pops/module-registry` is a stale docstring — together: **the 8 deferred sites this PRD tracks**.

Until these eight references are gone, `apps/pops-api/package.json` cannot drop its `@pops/module-registry` workspace dependency and PRD-218's "delete the package" finishing move cannot ship.

## API Surface

Two viable migration targets exist; this PRD picks one and migrates the eight sites onto it:

| Option                                                                                                                                | Shape                                                                      | Trade-off                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A. Co-locate** each pillar's `SettingsManifest` export inside its own pillar package                                                | `import { mediaManifest } from '@pops/pillar-media/settings'` (or similar) | Aligns with ADR-026 ("each pillar owns its contract surface"); zero shared registry coupling. Requires per-pillar moves. |
| **B. Move the settings surface to `@pops/pillar-sdk`** alongside the existing `ALL_MODULE_IDS` / `isKnownPillarId` helpers (PR #3090) | `import { mediaManifest } from '@pops/pillar-sdk/settings'`                | One central surface, mirrors the module-id helpers PR #3090 already added. Couples pillars through the SDK package.      |

The implementation in US-01 picks one option, justifies it inline, and applies it uniformly across all eight sites. **Option A is the recommended default** — it matches the pillar-ownership direction Theme 13 is steering toward (each pillar publishes its own contract; consumers reach into pillar-scoped subpaths). Option B is the fallback if per-pillar relocation introduces a circular dep with the SDK.

## Business Rules

- The migration is **mechanical**: same `SettingsManifest` shape, same export names, only the import specifier changes.
- No behavioural change at runtime. `pnpm --filter @pops/api test` must remain green before and after.
- `@pops/module-registry/settings` is **deleted** once the eight sites flip — it has no consumers outside this list.
- `@pops/module-registry` itself stays alive for the duration of [PRD-218](../218-module-registry-deprecation/README.md) US-03 (the runtime shim consumers), but its `./settings` subpath is removed.

## Edge Cases

| Case                                                                                                              | Behaviour                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pillar package doesn't exist yet to host its `SettingsManifest` (Option A)                                      | Fall back to Option B for that pillar, document in the US Notes. The pillar packages are scaffolded by Theme 13 Epic 00 — if a pillar isn't packaged yet, parking its settings on `@pops/pillar-sdk` is the pragmatic move.                                |
| Two pillars share a settings manifest (e.g. `core` exports both `aiConfigManifest` and `coreOperationalManifest`) | Each manifest lives next to the domain it belongs to — `aiConfigManifest` ships from the `ai` pillar package (or, transitionally, from `core` per ADR-026 since `ai` is a sub-module of `core` today), `coreOperationalManifest` from `core`. No bundling. |
| `modules/manifests.ts` and `modules/core/uri/resolver.ts` carry stale docstrings                                  | Comment-only refs — strip the `@pops/module-registry` mention from the docstring as part of the same change. No runtime impact.                                                                                                                            |
| Husky / lint-staged complains about the import-discipline rule (PRD-156)                                          | The import-discipline ESLint rule lives in `eslint-config-pops` — extend its allow-list to permit the new import path before flipping any consumer.                                                                                                        |

## The 8 deferred files

| #   | File                                                 | Today's reference                                                                                                         | Migration target (Option A)                     |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `apps/pops-api/src/modules/core/index.ts:1`          | `import { aiConfigManifest, coreOperationalManifest } from '@pops/module-registry/settings';`                             | `@pops/pillar-core/settings`                    |
| 2   | `apps/pops-api/src/modules/inventory/index.ts:1`     | `import { inventoryManifest } from '@pops/module-registry/settings';`                                                     | `@pops/pillar-inventory/settings`               |
| 3   | `apps/pops-api/src/modules/finance/index.ts:1`       | `import { financeManifest } from '@pops/module-registry/settings';`                                                       | `@pops/pillar-finance/settings`                 |
| 4   | `apps/pops-api/src/modules/cerebrum/index.ts:5`      | `import { cerebrumManifest } from '@pops/module-registry/settings';`                                                      | `@pops/pillar-cerebrum/settings`                |
| 5   | `apps/pops-api/src/modules/cerebrum/ego/index.ts:10` | `import { egoManifest } from '@pops/module-registry/settings';`                                                           | `@pops/pillar-cerebrum/settings` (sub-manifest) |
| 6   | `apps/pops-api/src/modules/media/index.ts:7-12`      | `import { arrManifest, mediaOperationalManifest, plexManifest, rotationManifest } from '@pops/module-registry/settings';` | `@pops/pillar-media/settings`                   |
| 7   | `apps/pops-api/src/modules/manifests.ts:7`           | Docstring only — `Settings have moved to '@pops/module-registry's MODULES constant ...`                                   | Rewrite docstring; no runtime change            |
| 8   | `apps/pops-api/src/modules/core/uri/resolver.ts:16`  | Docstring only — `Once '@pops/module-registry' (PRD-101 US-02) ships ...`                                                 | Rewrite docstring; no runtime change            |

## User Stories

| #   | Story                                                                           | Summary                                                                                                                       | Parallelisable                                  |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-pick-target-and-migrate](us-01-pick-target-and-migrate.md)               | Pick Option A or B, host the per-pillar `SettingsManifest` exports there, flip all 6 active import sites and 2 docstring refs | No — single mechanical sweep across the 8 files |
| 02  | [us-02-delete-legacy-settings-subpath](us-02-delete-legacy-settings-subpath.md) | Delete `@pops/module-registry/settings` subpath + exports; confirm no consumers remain                                        | Blocked by us-01                                |

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- All eight files listed above no longer reference `@pops/module-registry` (import or docstring).
- `@pops/module-registry/settings` subpath is removed from the package's `exports` map and `src/settings/`.
- `apps/pops-api/package.json` may still declare `@pops/module-registry` ([PRD-218](../218-module-registry-deprecation/README.md) US-03 retires the runtime shim consumers); this PRD only removes the `/settings` consumers.
- `pnpm --filter @pops/api test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- The runtime install-set shim consumers — [PRD-218](../218-module-registry-deprecation/README.md) US-03 handles those.
- The build-time `MODULES` / `KNOWN_MODULES` retirement — same PRD-218.
- Frontend `apps/pops-shell` consumers — none of them import `/settings`; this PRD touches `apps/pops-api` only.
- Changing the `SettingsManifest` contract shape (defined in `@pops/types`) — pure relocation, not redesign.

## References

- PR [#3090](https://github.com/knoxio/pops/pull/3090) — added `ALL_MODULE_IDS` + `isKnownPillarId` + `isModuleId` to `@pops/pillar-sdk` (the precedent for Option B).
- PR [#3126](https://github.com/knoxio/pops/pull/3126) — PRD-218 US-02 batch 2; first listed the 8 deferred files in its "Remaining for batch 3" section.
- PR [#3137](https://github.com/knoxio/pops/pull/3137) — PRD-218 US-02 batch 3 closeout; explicitly carved out the `/settings` consumers as a separate PRD.
- [PRD-218](../218-module-registry-deprecation/README.md) — parent deprecation tracker; this PRD removes one of its blocking dependencies.
- [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) — pillar ownership model that motivates Option A.
