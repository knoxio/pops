# US-02: Replace `MANIFEST_SOURCES` with workspace discovery

> PRD: [PRD-241 — Registry-driven `known-modules`](README.md)

## Description

As a platform maintainer, I want `pnpm registry:build` to discover every in-repo pillar's `ModuleManifest` by walking the workspace for `@pops/*-contract` packages and importing each one's `./manifest` export, so that adding or removing a pillar never requires editing `packages/module-registry/`.

## Acceptance Criteria

- [ ] `packages/module-registry/scripts/known-modules.ts` no longer declares `MANIFEST_SOURCES` as a literal array. The named manifest imports (`aiConfigManifest`, `coreOperationalManifest`, `financeManifest`, `inventoryManifest`, `arrManifest`, `mediaOperationalManifest`, `plexManifest`, `rotationManifest`, `cerebrumManifest`, `egoManifest`) are deleted.
- [ ] A new discovery routine — `discoverManifestSources()` (or named equivalent) — enumerates workspace packages matching `@pops/*-contract` via the workspace manifest (`pnpm-workspace.yaml` + each package's `package.json`), imports each one's `./manifest` export, collects the `ModuleManifest` values, and returns the same `readonly ModuleManifest[]` shape `MANIFEST_SOURCES` had.
- [ ] `MANIFEST_SOURCES` becomes either a thin re-export of the discovery result or is removed in favour of `discoverManifestSources()` being called directly from `scripts/build.ts`. Whichever shape lands, no file lists pillar names.
- [ ] Workspace packages matching `@pops/*-contract` that do not expose a `./manifest` export are skipped with a build-log info line naming the package. Discovery does not throw; this is the explicit opt-out path (e.g. `food-contracts` plural-legacy, future non-pillar contracts).
- [ ] Discovery is **build-time only**. `packages/module-registry/src/` source files do not import `node:fs`, `node:path`, or anything else that would force filesystem access at app runtime. The runtime surface (`MODULES`, `INSTALLED_MODULES`, `findModule`) is unchanged.
- [ ] `pnpm registry:build` produces a `packages/module-registry/src/generated.ts` byte-identical to the current artefact for the existing workspace (same manifests, same sort order, same `as const` literal). The CI guard (`git diff --exit-code packages/module-registry/src/generated.ts`) stays clean.
- [ ] A test asserts that every `@pops/*-contract` workspace member is listed as a `devDependency` of `@pops/module-registry`'s `package.json`. Missing pins surface as a clear failure pointing at the new contract package.
- [ ] A test asserts that re-running discovery on the current workspace yields the same `MANIFEST_SOURCES`-equivalent the deleted literal carried (same ids, same fields). The test is the structural regression guard.
- [ ] `ALWAYS_INSTALLED_IDS = ['core']` stays explicit. It is small and semantically the platform-shell contract per [PRD-100](../../../01-foundation/prds/100-module-system/README.md) — not a per-pillar enumeration.
- [ ] `pnpm --filter @pops/module-registry typecheck/test/build`, plus the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build`, all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- **Blocked by [US-01](us-01-add-manifest-export-per-pillar.md).** Discovery cannot succeed until every pillar's contract package exposes its `./manifest` export. US-01 status table should show every pillar as Done before US-02 starts.
- The discovery walk has two equally-valid implementations:
  - **Dynamic import** — iterate `@pops/*-contract` workspace pins, `await import('@pops/<id>-contract/manifest')`, collect exports. Simple, relies on tsx's ESM resolver; works because `module-registry/package.json` already lists every contract as a devDep.
  - **Workspace manifest scan** — parse `pnpm-workspace.yaml` + each package's `package.json`, filter on name pattern, dynamic-import each one's `./manifest`. Slightly more robust against accidentally-missing devDep pins.

  Pick the implementation that requires zero per-pillar edits to `module-registry` going forward. Either way, the contract is "be a workspace `@pops/*-contract` with a `./manifest` export".

- Existing `assertModuleManifest()` + cross-manifest invariants (duplicate ids, dangling `dependsOn`, AI tool name collisions) run on the discovered set unchanged. The validator is the safety net; discovery just hands it the input.
- A pillar can export multiple `ModuleManifest`s from one contract package — e.g. `@pops/core-contract/manifest` carries both `coreManifest` and `aiManifest`, `@pops/cerebrum-contract/manifest` carries both `cerebrumManifest` and `egoManifest`. The discovery routine flattens these into the `ModuleManifest[]` result. Documented in US-01.
- After this US lands, the only place a new in-repo pillar gets added is its own contract package + a workspace-pin line in `module-registry/package.json` devDeps. No source-file edit anywhere in `packages/module-registry/`.
- The generated artefact's stability is the load-bearing CI check. If discovery's iteration order is filesystem-dependent, sort the discovery output by package name before handing it to the rest of the build pipeline so the eventual id-sorted `generated.ts` does not drift between machines.
