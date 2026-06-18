# PRD-118: app-food Package Scaffold & Module Manifest

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Create the `packages/app-food` workspace package, mirror the conventions of the existing `app-finance` / `app-media` packages, declare the module manifest (PRD-098 contract) so the shell registers `/food` routes at runtime, and ship a placeholder landing page at `/food`. Every other Epic 01 PRD mounts surfaces under this package.

Schema-side service code (Drizzle, the recipe / ingredient / batch / DSL services from Epic 00) lives in this same package — Epic 00 implementation work creates `src/db/` under `packages/app-food/`. PRD-118 is responsible for the **package shell** (`package.json`, `tsconfig.json`, `src/index.ts`, `src/manifest.ts`, `src/routes.tsx`, basic landing page); the schema files arrive when Epic 00 is built.

## Package Scaffold

```
packages/app-food/
  package.json
  tsconfig.json
  src/
    index.ts              # public exports: manifest, schema (when Epic 00 lands), types
    manifest.ts           # ModuleManifest<...> declaration
    routes.tsx            # routes + navConfig
    pages/
      FoodLandingPage.tsx # placeholder landing at /food
    components/           # shared components for downstream Epic 01 PRDs
    hooks/
    lib/
    test-setup.ts
```

Mirror `packages/app-finance/`'s structure exactly. Adopt the same `pnpm` scripts (`typecheck`, `test`, `test:coverage`, `test:watch`) and the same eslint/prettier config inheritance.

### `package.json` highlights

```json
{
  "name": "@pops/app-food",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pops/api": "workspace:*",
    "@pops/api-client": "workspace:*",
    "@pops/db-types": "workspace:*",
    "@pops/navigation": "workspace:*",
    "@pops/types": "workspace:*",
    "@pops/ui": "workspace:*",
    "@tanstack/react-query": "5.101.0",
    "date-fns": "^4.4.0",
    "lucide-react": "^1.17.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-hook-form": "^7.77.0"
  },
  "devDependencies": {
    "vitest": "^x",
    "typescript": "^x",
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.0.0"
  }
}
```

Exact versions match what `app-finance`'s `package.json` declares at the time of implementation (React 19, pinned `react-hook-form`) — do NOT introduce new major versions of shared deps. CodeMirror, Lezer, and any heavy editor deps are declared in PRD-120 when that package's needs are concrete.

## Module Manifest

```ts
// packages/app-food/src/manifest.ts
import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'food',
  name: 'Food',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Recipes, ingredients, meal planning, and multimodal ingestion.',
  frontend: {
    routes,
    navConfig,
  },
  // When Epic 00 backend services land, this manifest extends with:
  //   backend: {
  //     router: foodRouter,                    // per PRD-098
  //   },
  //   migrations: foodMigrationDescriptors,    // per PRD-101 (MigrationDescriptor[])
  // PRD-118's scope is the frontend-only manifest; backend + migrations slots are
  // populated by Epic 00 implementation work, not this PRD.
};
```

Per PRD-098, the manifest base shape exposes `backend?: { router: TRouter }`. Per PRD-101 US-09, the manifest is extended with a top-level `migrations: MigrationDescriptor[]?` slot that the per-module migration runner reads. PRD-118 ships the frontend-only manifest; the backend slot and migrations slot are populated when Epic 00 implementation creates `apps/pops-api/src/modules/food/` and the migration files. The Epic 00 migration descriptors are split by schema concern (ingredient model, recipe model, batches, substitutions, ingest sources, plan entries, lists) so each PRD-101-gated migration file is skipped when `food` is not installed.

## Routes & Nav Config

```ts
// packages/app-food/src/routes.tsx
import { FoodLandingPage } from './pages/FoodLandingPage';

export const routes = [
  {
    path: '/food',
    element: <FoodLandingPage />,
  },
  // Recipe CRUD routes added in PRD-119; data page in PRD-122; etc.
];

export const navConfig = {
  primary: {
    label: 'Food',
    icon: 'utensils',           // lucide-react icon name
    path: '/food',
    order: 50,                  // between Inventory and Cerebrum; exact integer confirmed at impl
  },
  secondary: [
    // Sub-nav populated as Epic 01 PRDs land:
    //   /food/recipes  - Recipes (PRD-119)
    //   /food/data     - Manage data (PRD-122)
  ],
};
```

`navConfig.primary.order` slots Food into the shell sidebar between existing modules. Exact integer chosen at implementation time so it doesn't collide with other modules' renumbering.

## Landing Page

`pages/FoodLandingPage.tsx` ships as a placeholder that lists the sub-surfaces as they become available. v1 contents:

- Heading "Food".
- Brief paragraph: "Recipes, ingredients, meal planning. Ingest from URLs, Instagram, screenshots, or paste."
- Empty-state cards or links for the sub-surfaces. Initially: "Recipes (coming soon)", "Manage data (coming soon)".
- No real data fetching. Pure UI scaffold.

Once Epic 01 PRDs 119 and 122 land, the landing page is updated to link to them. The placeholder is intentional so the route + nav exist on day one even before deeper UIs are built.

## Service Layer Co-location

Epic 00's services (`packages/app-food/src/db/services/*.ts`) are NOT introduced by this PRD — they arrive when Epic 00 schema PRDs are implemented. This PRD's scope is the package shell only. However, the `package.json` dependencies above include `@pops/db-types` and `@pops/api` so Epic 00 service code can land into the package without additional dependency churn.

## Business Rules

- Package version starts at `0.1.0`. Subsequent Epic 01 PRDs do not bump the version; the version is managed by repo-wide release automation, not per-PRD.
- The manifest's `id` is `'food'`. Slug used in module-install env vars (e.g. `POPS_APPS=finance,media,inventory,food`) and in module-registry queries.
- The shell does NOT need code changes to mount `food` — the registry-driven loader (theme 01-foundation PRDs 097-100) reads the manifest at runtime. Adding `food` to `POPS_APPS` is the install step.
- Migration ownership tags allow food schema migrations to be gated on the module being installed. Operators who run POPS without food don't get its tables.
- Routes export pattern (`export const routes`) and nav export pattern (`export const navConfig`) must match the exact shape consumed by `@pops/navigation` — copy from `app-finance` for parity, do not invent.

## Edge Cases

| Case                                                                             | Behaviour                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Operator installs `food` in `POPS_APPS` but didn't run food migrations           | Per-module migration runner (PRD-101 onwards) runs them on next boot. Routes mount; pages may error until DB is ready. |
| Operator removes `food` from `POPS_APPS`                                         | Routes disappear from the shell. Migrations stay applied (no destructive uninstall). Tables persist with data.         |
| Two packages declare the same `manifest.id`                                      | Module registry detects collision at startup; refuses to load. Standard registry behaviour, not new for this PRD.      |
| Direct nav to `/food/recipes` before PRD-119 lands                               | 404 from shell router (route not registered). Acceptable for the in-progress state.                                    |
| `manifest.migrations` lists a descriptor that doesn't exist in the migration dir | Per-module migration runner logs a warning and continues (orphan handling per PRD-101). Operator updates manifest.     |

## Acceptance Criteria

Inline per theme protocol.

### Package shell

- [x] `packages/app-food/` directory exists with the files listed above.
- [x] `package.json` has the workspace deps listed; exact versions match `app-finance` at implementation time. Trimmed to the deps food actually needs (no dnd-kit, recharts, papaparse, etc.) — pins for shared deps match app-finance.
- [x] `tsconfig.json` extends the workspace base config (same as `app-finance`).
- [x] `pnpm install` at repo root resolves cleanly with the new package.
- [x] `mise typecheck` passes (the new package is included automatically via the workspace glob).

### Manifest & routing

- [x] `packages/app-food/src/manifest.ts` exports `manifest: ModuleManifest<...>` with `id='food'`, `surfaces=['app']`, and `frontend.routes` + `frontend.navConfig` populated.
- [x] `packages/app-food/src/routes.tsx` exports `routes` and `navConfig` matching the shape consumed by `@pops/navigation`. (Local `AppNavConfigShape` mirrors the canonical shape used by `apps/pops-shell/src/app/nav/types.ts`; finance mirrors it the same way.)
- [x] When `POPS_APPS` includes `food`, the shell mounts `/food` and shows the landing page. (`food` is registered in `packages/module-registry/scripts/known-modules.ts`; manifests + nav + i18n wired through `apps/pops-shell/src/app/{installed-modules,nav/registry}.ts`. Verified via `pnpm test` in `apps/pops-shell` — all 300 tests pass including `tests/manifests.test.ts` which now asserts `food` ∈ frontend manifests.)
- [x] When `POPS_APPS` excludes `food`, no `/food` route is reachable. (Per PRD-100 / `installedAppManifests()` semantics: when `MODULES` excludes `food`, `installedAppManifests()` skips it and the router's catch-all renders `NotInstalledPage`.)
- [x] Nav sidebar shows "Food" entry between adjacent modules at the chosen `order`. (Order is determined by `registeredApps` array position in `apps/pops-shell/src/app/nav/registry.ts`; placed between `inventoryNavConfig` and `cerebrumNavConfig`.)

### Landing page

- [x] `pages/FoodLandingPage.tsx` renders the placeholder content described above.
- [x] No data fetching, no errors in the browser console on first load. (Pure render — no `useQuery` / `useMutation`.)
- [x] Page is responsive — mobile (375px), tablet (768px), desktop (1280px) layouts all readable. (Tailwind grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` collapses to one column < 640px.)

### Tests

- [x] Vitest case asserts `manifest.id === 'food'` and that `routes` contains `/food`. (`src/__tests__/manifest.test.ts` — 6 cases.)
- [x] Vitest snapshot test on `FoodLandingPage` (renders without crashing). (`src/pages/__tests__/FoodLandingPage.test.tsx` — 2 cases, asserts heading + tile labels render rather than relying on brittle snapshots.)
- [x] `apps/pops-shell` integration tests (existing ones for module mounting) pick up the new module via the registry without code changes. (`apps/pops-shell/src/tests/manifests.test.ts` extended with the `food` entry; 300/300 shell tests pass.)

### Documentation

- [x] `packages/app-food/README.md` describes the package, its scope, and points at `pillars/food/docs/` for the spec.
- [x] `pillars/food/docs/README.md` epic 01 row stays "Not started" until at least one downstream Epic 01 PRD is in progress. (PRD-118 is foundational, not downstream — epic 01 stays "Not started" as instructed.)

## Out of Scope

- Recipe CRUD pages — **PRD-119**.
- DSL editor — **PRD-120**.
- DSL renderer — **PRD-121**.
- Management page — **PRD-122**.
- Conversion table & admin — **PRD-123**.
- Hero image upload — **PRD-124**.
- API tRPC procedures — defined in their consuming PRDs (recipe CRUD endpoints in PRD-119, hero upload in PRD-124, etc).
- Service code for recipe management (createRecipe, etc.) — already specified by PRD-107; implementation lives in this package's `src/db/services/` but is introduced by Epic 00 implementation, not by this PRD.
- Backend module registration in `apps/pops-api/src/modules/food/` — Epic 00 implementation populates the `backend.router` slot and `migrations` slot per PRD-098/101 contracts. PRD-118's manifest ships the frontend-only shape.
