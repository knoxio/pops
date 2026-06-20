# PRD-139: app-lists Shell Module & Manifest

> Epic: [04 — Lists & Shopping](../../epics/04-lists-and-shopping.md)

## Overview

Turn `packages/app-lists` (scaffolded as a schema-only package by PRD-112) into a shell-registered module: add the front-end folder structure, declare the `ModuleManifest`, register the `/lists` top-level route, ship a placeholder landing page, and add the sidebar entry. Mirrors PRD-118 for food — same conventions, different domain.

After this PRD, the user can install `lists` via `POPS_APPS=...,lists,...` and navigate to `/lists` in the shell. The page is intentionally empty — PRDs 140-142 populate it. This PRD is the integration point everything else in Epic 04 mounts on.

Lists is generic and **does not depend on food**. Food declares lists as a dependency for the send action (PRD-142), but a deployment can install lists without food (manual list-keeping) or food without lists (lose Send-to-list affordance gracefully).

## Package Structure (additions to PRD-112)

PRD-112 created `packages/app-lists/` with `src/db/{schema,services}/`. PRD-139 extends:

```
packages/app-lists/
  package.json                # extend deps (see below)
  src/
    index.ts                  # re-export manifest + db services (existing) + routes (new)
    manifest.ts               # NEW — ModuleManifest declaration
    routes.tsx                # NEW — routes + navConfig
    pages/
      ListsLandingPage.tsx    # NEW — placeholder /lists landing
    components/               # NEW (empty in this PRD; populated by PRD-140)
    hooks/                    # NEW
    lib/                      # NEW
    test-setup.ts             # NEW
    db/                       # EXISTING (PRD-112)
      schema.ts
      services/
        lists.ts
        list-items.ts
    types.ts                  # EXISTING (PRD-112)
```

Mirror `packages/app-food/`'s structure exactly. Same `pnpm` scripts (`typecheck`, `test`, `test:coverage`, `test:watch`).

### `package.json` extensions

PRD-112's `package.json` declared only the workspace baseline. Extend to:

```json
{
  "name": "@pops/app-lists",
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

Exact versions match `app-food` at implementation time (React 19, pinned `react-hook-form`). Do NOT introduce new major versions of shared deps.

## Module Manifest

```ts
// packages/app-lists/src/manifest.ts
import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'lists',
  name: 'Lists',
  version: '0.1.0',
  surfaces: ['app'],
  description:
    'Shopping, packing, todo, and generic lists. Generic — consumed by other modules (food).',
  frontend: {
    routes,
    navConfig,
  },
  // backend.router populated by PRD-140 (the tRPC procedures for CRUD).
  // migrations slot is populated by PRD-112's implementation (one MigrationDescriptor for lists + list_items).
};
```

Per PRD-098, `backend?: { router: TRouter }` is part of the manifest base shape. Per PRD-101, `migrations: MigrationDescriptor[]?` is the top-level slot. PRD-139's scope is the frontend manifest; backend router + migrations are populated by PRD-140 (router) and PRD-112's implementation (migration descriptor).

## Routes & Nav Config

```ts
// packages/app-lists/src/routes.tsx
import { ListsLandingPage } from './pages/ListsLandingPage';

export const routes = [
  {
    path: '/lists',
    element: <ListsLandingPage />,
  },
  // Index, detail, new routes added in PRD-140.
];

export const navConfig = {
  primary: {
    label: 'Lists',
    icon: 'list-checks',          // lucide-react icon name
    path: '/lists',
    order: 55,                    // adjacent to Food (50); exact integer confirmed at impl
  },
  secondary: [
    // Sub-nav populated in PRD-140 with kind filters once useful (e.g. Shopping, Todo, All).
  ],
};
```

`navConfig.primary.order` slots Lists next to Food in the shell sidebar. Exact integer chosen at implementation time.

## Landing Page

`pages/ListsLandingPage.tsx` ships as a placeholder mirroring `FoodLandingPage` (PRD-118):

- Heading "Lists".
- Brief paragraph: "Shopping, packing, and todo lists. Other modules send items here (food → shopping list)."
- Empty-state cards or links for the sub-surfaces. Initially: "Browse lists (coming soon)", "New list (coming soon)".
- No data fetching. Pure UI scaffold.

Once PRD-140 lands, the landing page is updated to redirect to `/lists/index` or to render PRD-140's index inline. PRD-139's placeholder is intentional so the route + nav exist on day one.

## Cross-Module Boundary

The `app-lists` module is consumed by `app-food` via PRD-142's Send action. The integration shape:

- **`app-food` declares no static import of `@pops/app-lists`** at the package level. It calls `app-lists`' tRPC procedures (PRD-140 surfaces the router) via the shared `@pops/api-client`. Avoids coupling the two packages' build / dependency graphs.
- **The Send modal** (PRD-142) uses `@pops/api-client` to query `lists.list.list({ kind: 'shopping', archived: false })` and `lists.list.create({ name, kind: 'shopping' })` + `lists.items.bulkAdd(...)`.
- **No food-specific types leak into app-lists**. The `list_items.ref_kind='ingredient'` / `'variant'` enum values are domain-agnostic — they happen to be food entities but the lists package doesn't know that. Service layer accepts them as opaque numbers.

## Business Rules

- Package version starts at `0.1.0`. Subsequent Epic 04 / future-epic PRDs do not bump the version.
- Manifest `id` is `'lists'`. Used in `POPS_APPS` env var (e.g. `POPS_APPS=finance,media,food,lists`) and in module-registry queries.
- The shell does NOT need code changes to mount `lists` — registry-driven loader reads the manifest at runtime.
- Migrations stay applied even when `lists` is removed from `POPS_APPS` (non-destructive uninstall). Tables persist.
- Routes export pattern (`export const routes`) and nav export pattern (`export const navConfig`) must match the exact shape consumed by `@pops/navigation` — copy from `app-food`'s shape.

## Edge Cases

| Case                                                                             | Behaviour                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator installs `lists` in `POPS_APPS` but didn't run lists migrations         | Per-module migration runner (PRD-101) runs them on next boot. Routes mount; landing page works with no data. CRUD pages (PRD-140) error until DB is ready. |
| Operator removes `lists` from `POPS_APPS` while food is installed                | `/lists` routes disappear. Food's Send-to-list button (PRD-142) shows "Lists module not installed — install `lists` in POPS_APPS to use this feature."     |
| Direct nav to `/lists/123` before PRD-140 lands                                  | 404 from shell router (route not registered). Acceptable for the in-progress state.                                                                        |
| Two packages declare the same `manifest.id='lists'`                              | Module registry collision at startup; refuses to load. Standard registry behaviour.                                                                        |
| Operator removes `lists` after food has sent items there                         | Tables persist; data is recoverable on re-install. No food-side state cleanup needed because food never persists list IDs on its rows.                     |
| `manifest.migrations` lists a descriptor that doesn't exist in the migration dir | Per-module migration runner logs a warning (PRD-101 orphan handling). Operator updates manifest.                                                           |

## Acceptance Criteria

Inline per theme protocol.

### Package shell

- [x] `packages/app-lists/` directory has the new files listed above (in addition to PRD-112's `src/db/`).
- [x] `package.json` has the workspace deps listed above; exact versions match `app-food` at implementation time.
- [x] `tsconfig.json` extends the workspace base config (same as `app-food`).
- [x] `pnpm install` at repo root resolves cleanly.
- [x] `mise typecheck` passes.

### Manifest & routing

- [x] `packages/app-lists/src/manifest.ts` exports `manifest: ModuleManifest<...>` with `id='lists'`, `surfaces=['app']`, and `frontend.routes` + `frontend.navConfig` populated.
- [x] `packages/app-lists/src/routes.tsx` exports `routes` and `navConfig` matching the shape consumed by `@pops/navigation`.
- [x] When `POPS_APPS` includes `lists`, the shell mounts `/lists` and shows the landing page.
- [x] When `POPS_APPS` excludes `lists`, no `/lists` route is reachable.
- [x] Nav sidebar shows "Lists" entry adjacent to Food.

### Landing page

- [x] `pages/ListsLandingPage.tsx` renders the placeholder content described above.
- [x] No data fetching, no errors in the browser console on first load.
- [x] Page is responsive — mobile (375px), tablet (768px), desktop (1280px) layouts all readable.

### Cross-module behaviour

- [ ] `app-food` does NOT statically import `@pops/app-lists` — verified by inspecting `packages/app-food/package.json` for absence of the dep. **NOTE:** `app-food/package.json` currently declares `@pops/app-lists: workspace:*` (predates this PRD; food module shipped first). Removing the static dep is a follow-up tied to PRD-142's send action implementation — the runtime invariant (no module-level top imports of `@pops/app-lists` in food source) holds today.
- [ ] When `lists` is not installed, food's Send-to-list flow (PRD-142) gracefully shows a "Lists module not installed" message (test stub for PRD-142's button click). **Deferred to PRD-142.**

### Tests

- [x] Vitest case asserts `manifest.id === 'lists'` and that `routes` contains `/lists`.
- [x] Vitest render test on `ListsLandingPage` (renders title + both placeholder cards without crashing). The original AC said "snapshot test"; explicit assertions were used instead — same coverage, no snapshot churn.
- [x] `apps/pops-shell` integration tests pick up the new module. **NOTE:** `manifests.test.ts` is extended with the `lists` entry (one line added to the parameterised `pageRoutedApps` table); the original AC implied zero changes, but mirroring the existing food/finance/media/inventory/ai/cerebrum row was the canonical pattern. The build-time registry (`installed-modules.ts`, `nav/registry.ts`) is similarly extended one row each — same shape PRD-118 established.

### Documentation

- [x] `packages/app-lists/README.md` describes the package, its scope, and points at `pillars/food/docs/` for the food-side spec (with a note that lists itself is theme-agnostic).
- [x] `pillars/food/docs/README.md` epic 04 row stays "Not started" until at least one downstream Epic 04 PRD is in progress.

## Out of Scope

- Generic lists CRUD UI — **PRD-140**.
- Shopping list specialisation — **PRD-141**.
- Send-to-list action — **PRD-142**.
- tRPC routers for lists (`lists.list.*`, `lists.items.*`) — **PRD-140** (the consumer side wires these into the manifest's `backend.router` slot at that time).
- Service implementations for lists / list_items — already specified by PRD-112; implementation lives in `src/db/services/` and arrives with Epic 00 implementation.
- Mobile-optimised landing page — placeholder only; PRD-140 owns the real index UI.
- Pre-population of seed lists (e.g. a default "Shopping list") — not in v1.
- Lists module's own ingestion / external sync — none, ever.
- Cross-cutting list types beyond `shopping` in v1 — PRD-141 specialises only `shopping`. Other kinds render via PRD-140's generic path.

## Requires (cross-PRD dependencies)

- **PRD-098** — `ModuleManifest` shape (`backend?: { router }` slot).
- **PRD-101** — per-module migration runner; `migrations` slot on the manifest.
- **PRD-112** — the package this PRD extends; the `lists` / `list_items` schema; the existing `src/db/` directory.
- **PRD-118** — the precedent pattern this PRD mirrors verbatim (manifest declaration, package.json shape, routes/navConfig pattern, landing-page conventions). Implementation copies the pattern from `app-food`.
