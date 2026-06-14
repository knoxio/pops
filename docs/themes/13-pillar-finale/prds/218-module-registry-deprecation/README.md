# PRD-218: `@pops/module-registry` deprecation

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Not started**

## Overview

The build-time `@pops/module-registry` (PRD-101) was the shell's static install-set registry. After Theme 13, the runtime registry (Epic 02) is authoritative. This PRD deprecates the build-time registry: it becomes a thin shim around the runtime registry, with an offline-dev fallback for cases where the registry isn't reachable.

[PRD-241](../241-registry-driven-known-modules/README.md) is a strict predecessor: `module-registry` cannot be retired until its hand-curated `MANIFEST_SOURCES` literal in `scripts/known-modules.ts` is replaced by the workspace discovery walk. PRD-241 reshapes the build script; this PRD then retires the package on top of that.

## Data Model

No data.

## API Surface

The legacy `MODULES` const stays exported but becomes derived:

```ts
// @pops/module-registry (post-PRD-218)
export const MODULES = await fetchFromRuntimeRegistry().catch(() => loadOfflineSeed());
```

Offline seed is a JSON file committed for dev use; production reads the runtime registry.

## Business Rules

- **Production reads runtime registry only.** Offline seed is a fallback for `pnpm dev` when core-api isn't available.
- **`KNOWN_MODULES` export retired.** Consumers shift to `PILLARS` from `@pops/pillar-sdk`.
- **Existing consumers of `MODULES` keep working** during the transition; their references just resolve to runtime-derived data.

## Edge Cases

| Case                                 | Behaviour                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Dev environment has core-api running | Fetched from runtime; matches prod.                                                         |
| Dev environment offline              | Falls back to seed; stale but usable.                                                       |
| Prod registry empty (cold start)     | Bootstrap order: pops-shell waits for core-api healthcheck (via depends_on) before booting. |

## Acceptance Criteria

- [ ] `@pops/module-registry` root entry resolves `MODULES` from the runtime registry (Epic 02) with an offline JSON seed fallback. Today (`packages/module-registry/src/index.ts`) it still re-exports the build-time `generated.js` constant only.
- [ ] `KNOWN_MODULES` is retired in favour of `PILLARS` from `@pops/pillar-sdk` (`packages/pillar-sdk/src/capabilities/known-pillar-id.ts` already exports it).
- [ ] All exports of `@pops/module-registry` (root and `./settings`) carry `@deprecated` JSDoc tags with a migration pointer. Today no `@deprecated` markers exist anywhere in `packages/module-registry/src`.
- [ ] Every consumer of `@pops/module-registry` listed below either (a) imports through the shimmed runtime-derived `MODULES`, or (b) has been moved to `PILLARS` / runtime `pillar()` SDK and dropped the dependency.
- [ ] `apps/pops-shell/package.json`, `apps/pops-api/package.json`, and `packages/navigation/package.json` no longer declare `@pops/module-registry` as a workspace dependency once migration is complete (or, for the shim phase, only the shell retains it).

## Consumer Migration Audit

23 source files reference `@pops/module-registry` outside the package itself. 0 have migrated.

### `apps/pops-shell` — 8 files

| File                                  | Symbols used    | Migration target                                              | Status      |
| ------------------------------------- | --------------- | ------------------------------------------------------------- | ----------- |
| `src/app/installed-modules.ts`        | `MODULES`       | runtime registry via `pillar()` SDK, joined with FE manifests | Not started |
| `src/app/overlays/registry.ts`        | `MODULES`       | runtime registry (filter to `overlay` install set)            | Not started |
| `src/app/router.tsx`                  | `KNOWN_MODULES` | `PILLARS` from `@pops/pillar-sdk`                             | Not started |
| `src/app/pages/SettingsPage.tsx`      | `MODULES`       | runtime registry + per-pillar settings manifests              | Not started |
| `src/app/pages/SettingsPage.test.tsx` | `vi.mock(...)`  | mock pillar SDK / runtime registry instead                    | Not started |
| `scripts/build-registry-snapshot.ts`  | (comment ref)   | retire script once shim derives from runtime                  | Not started |
| `playwright.config.ts`                | (alias config)  | drop snapshot alias once shim handles offline mode            | Not started |
| `vite.config.ts`                      | (alias config)  | drop snapshot alias once shim handles offline mode            | Not started |

### `apps/pops-api` — 13 files

| File                                        | Symbols used                                                   | Migration target                                         | Status      |
| ------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| `src/router.ts`                             | `type MODULES`                                                 | `RegisteredModule` / runtime registry type               | Not started |
| `src/modules/installed-modules.ts`          | `MODULES`                                                      | runtime registry aggregator                              | Not started |
| `src/modules/search-adapters.ts`            | `isModuleId`                                                   | `isKnownPillarId` from `@pops/pillar-sdk`                | Not started |
| `src/modules/manifests.ts`                  | (comment ref)                                                  | update docstring after shim lands                        | Not started |
| `src/modules/core/uri/resolver.ts`          | (comment ref)                                                  | update docstring after shim lands                        | Not started |
| `src/modules/core/features/credentials.ts`  | `MODULES`                                                      | runtime registry                                         | Not started |
| `src/modules/core/features/service.test.ts` | `vi.mock(...)`                                                 | mock runtime registry                                    | Not started |
| `src/modules/core/index.ts`                 | `coreOperationalManifest`, `aiConfigManifest` from `/settings` | per-pillar settings module (post-Epic 02 settings split) | Not started |
| `src/modules/finance/index.ts`              | `financeManifest` from `/settings`                             | finance pillar's own settings module                     | Not started |
| `src/modules/inventory/index.ts`            | `inventoryManifest` from `/settings`                           | inventory pillar's own settings module                   | Not started |
| `src/modules/cerebrum/index.ts`             | `cerebrumManifest` from `/settings`                            | cerebrum pillar's own settings module                    | Not started |
| `src/modules/cerebrum/ego/index.ts`         | `egoManifest` from `/settings`                                 | cerebrum pillar's own settings module                    | Not started |
| `src/modules/media/index.ts`                | settings manifests from `/settings`                            | media pillar's own settings module                       | Not started |

### `packages/navigation` — 2 files

| File                                        | Symbols used    | Migration target                          | Status      |
| ------------------------------------------- | --------------- | ----------------------------------------- | ----------- |
| `src/search-input/installed-module.ts`      | `isModuleId`    | `isKnownPillarId` from `@pops/pillar-sdk` | Not started |
| `src/search-input/installed-module.test.ts` | `KNOWN_MODULES` | `PILLARS` from `@pops/pillar-sdk`         | Not started |

### Package manifests

`@pops/module-registry` is declared as a workspace dependency in:

- `apps/pops-shell/package.json`
- `apps/pops-api/package.json`
- `packages/navigation/package.json`

All three remain in place until the shim ships (US-01) and consumers move (US-03).

## User Stories

| #   | Story                                                     | Summary                                                                   | Status      |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------- | ----------- |
| 01  | [us-01-shim-implementation](us-01-shim-implementation.md) | Runtime install-set shim: `INSTALLED_MODULES` + `isInstalledModule`       | Done        |
| 02  | [us-02-deprecation-notice](us-02-deprecation-notice.md)   | Migrate the 20 deferred consumers from `KNOWN_MODULES` filter to the shim | Not started |
| 03  | [us-03-consumer-migration](us-03-consumer-migration.md)   | Migrate shell consumers from `MODULES` to `PILLARS` + runtime             | Not started |

## Out of Scope

- Removing the package entirely. Stays as a shim until consumers fully migrate.
- New build-time registries.
