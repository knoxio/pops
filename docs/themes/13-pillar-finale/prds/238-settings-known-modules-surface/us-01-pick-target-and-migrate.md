# US-01: Pick the new settings-manifest home and migrate the eight call sites

> PRD: [PRD-238 — Settings-imports migration off `@pops/module-registry`](README.md)

## Description

As a maintainer retiring `@pops/module-registry`, I want every per-pillar `SettingsManifest` export to live next to its owning pillar (or, fallback, on `@pops/pillar-sdk`) so that `apps/pops-api` stops importing from a soon-to-be-deleted package.

## Acceptance Criteria

- [ ] One target is chosen and recorded inline in this US's Notes section: **Option A** (per-pillar package, default) or **Option B** (`@pops/pillar-sdk/settings`, fallback).
- [ ] Each pillar's `SettingsManifest` is exported from the chosen target with the same export name as today (`mediaOperationalManifest`, `arrManifest`, `plexManifest`, `rotationManifest`, `inventoryManifest`, `financeManifest`, `cerebrumManifest`, `egoManifest`, `aiConfigManifest`, `coreOperationalManifest`).
- [ ] All six active import sites are flipped:
  - [ ] `apps/pops-api/src/modules/core/index.ts`
  - [ ] `apps/pops-api/src/modules/inventory/index.ts`
  - [ ] `apps/pops-api/src/modules/finance/index.ts`
  - [ ] `apps/pops-api/src/modules/cerebrum/index.ts`
  - [ ] `apps/pops-api/src/modules/cerebrum/ego/index.ts`
  - [ ] `apps/pops-api/src/modules/media/index.ts`
- [ ] Both docstring-only references are rewritten to drop the `@pops/module-registry` mention:
  - [ ] `apps/pops-api/src/modules/manifests.ts`
  - [ ] `apps/pops-api/src/modules/core/uri/resolver.ts`
- [ ] No new `as any` / `as unknown as Type` casts introduced; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/api typecheck`, `pnpm --filter @pops/api test`, `pnpm lint`, `pnpm build` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The eight files are listed with line numbers in [the parent PRD](README.md#the-8-deferred-files).
- Manifest contract type is `SettingsManifest` from `@pops/types` — that import stays put.
- Option A requires per-pillar packages to exist. Inventory which pillar packages are scaffolded today (Theme 13 Epic 00) before committing to Option A for every pillar; mix-and-match per pillar is allowed.
- The import-discipline ESLint rule (PRD-156) may need its allow-list extended for whichever target gets picked. Adjust `eslint-config-pops` first, then flip consumers, otherwise lint-staged blocks the commit.
- The `egoManifest` lives under `cerebrum/ego/` today because `ego` is a sub-module of `cerebrum` (per ADR-026, `ego` is transitional alongside `ai`). Co-locate it inside the `cerebrum` pillar package as a sub-manifest, not its own package.
- Do not touch the `SettingsManifest` shape, the per-pillar manifest contents, or the `apps/pops-shell` consumers — those are explicitly out of scope.
