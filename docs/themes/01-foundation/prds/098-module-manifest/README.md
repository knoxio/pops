# PRD-098: Module Manifest

> Epic: [Modular Module Runtime](../../epics/10-modular-module-runtime.md)
> Status: In progress

## Overview

Define the `ModuleManifest` type and have every shipped module export a manifest constant. **Metadata-only at this PRD** — no runtime registry yet. Establishes the contract the runtime loader (PRD-100) and the overlay-ego extraction (PRD-099) will consume.

## Type

`ModuleManifest` lives in `@pops/types/src/module-manifest.ts` and is re-exported from the package root. Generic over the router/route/nav-config types so the package does not depend on tRPC, react-router, or `@pops/navigation`.

```ts
export type ModuleSurface = 'app' | 'overlay';

export interface ModuleOverlayConfig {
  chromeSlot: string;
  shortcut?: string;
}

export interface ModuleManifest<TRouter = unknown, TRoutes = unknown, TNavConfig = unknown> {
  id: string;
  name: string;
  version?: string;
  surfaces: readonly ModuleSurface[];
  description?: string;
  dependsOn?: readonly string[];
  provides?: readonly string[];
  settings?: SettingsManifest; // PRD-093 slot
  backend?: { router: TRouter };
  frontend?: { routes?: TRoutes; navConfig?: TNavConfig; overlay?: ModuleOverlayConfig };
}
```

`assertModuleManifest(value, context)` is a runtime guard exported from the same module, used by the assertion test (US-04). It throws `TypeError` with a descriptive context on the first failed check.

## Adoption

Each `packages/app-*` exports `manifest` alongside `routes` and `navConfig`. Each `apps/pops-api/src/modules/<x>` exports `manifest` referencing its router and (where applicable) its `SettingsManifest`. No runtime change: existing static imports of `routes` / routers continue to work; the manifest is additive metadata.

## Edge Cases

| Case                                                               | Behaviour                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Module with multiple `SettingsManifest` registrations (e.g. media) | The `settings` slot is left empty; existing `settingsRegistry.register` calls remain. Single-manifest slot is enforced by type. |
| Backend-only module (e.g. `core`)                                  | `frontend` is omitted. Loader still mounts it; `core` is non-optional in PRD-100.                                               |
| Frontend-only app (no backend module)                              | `backend` is omitted.                                                                                                           |
| Dual-surface module                                                | `surfaces: ['app', 'overlay']` and `frontend.overlay` is required.                                                              |

## User Stories

| #   | Story                                                             | Summary                                                                                     | Parallelisable     |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ |
| 01  | [us-01-manifest-type](us-01-manifest-type.md)                     | Define `ModuleManifest` + `assertModuleManifest` in `@pops/types`                           | Yes                |
| 02  | [us-02-export-from-apps](us-02-export-from-apps.md)               | Each `packages/app-*` exports `manifest` alongside existing exports                         | Blocked by 01      |
| 03  | [us-03-export-from-api-modules](us-03-export-from-api-modules.md) | Each `apps/pops-api/src/modules/<x>` exports `manifest` referencing its router and settings | Blocked by 01      |
| 04  | [us-04-typecheck-coverage](us-04-typecheck-coverage.md)           | Assertion test that every shipped module exports a valid manifest (frontend + backend)      | Blocked by 02 + 03 |

## Out of Scope

- Runtime consumption of the manifest (PRD-100).
- Removing the existing `settingsRegistry.register` calls (parallel concern; manifest is a slot, not a replacement).
- Schema/migration metadata in the manifest. Per-module migrations stay deferred (Epic 10 out-of-scope).
- Hot-loading or watch-mode reloading on manifest changes.
