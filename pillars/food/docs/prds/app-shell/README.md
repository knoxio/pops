# app-food Shell & Module Manifest

Status: Done. The `@pops/app-food` frontend module (`pillars/food/app`) exists, exports a `ModuleManifest` with `id='food'`, and is discovered by the shell at runtime. Surfaces have grown far past the original placeholder — recipes, data management, inbox, plan, fridge, solve, shopping, prompts are all mounted. The `/food` index still renders a placeholder landing page.

## Purpose

`pillars/food/app` is the food pillar's frontend module: a `@pops/app-food` workspace package that declares a module manifest, route table, and nav config, plus the page components for every food surface. The shell host (`pillars/shell`) discovers this manifest at runtime via the `registry` pillar and mounts `/food/*` — no shell code change is needed to add the pillar. This PRD owns the module shell (manifest, routes, nav, landing page); individual surfaces are specified by their own PRDs.

## Module Manifest

`pillars/food/app/src/manifest.ts` exports:

```ts
export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'food',
  name: 'Food',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Recipes, ingredients, meal planning, and multimodal ingestion.',
  frontend: { routes, navConfig },
};
```

- `id` is `'food'` — the pillar/module slug, used for the `/food` route base and registry lookup.
- `surfaces: ['app']` marks this as a frontend app surface. The shell's `filterAppManifests()` mounts it at path `manifest.id`.
- `frontend.routes` and `frontend.navConfig` are the only manifest slots populated — this is a frontend-only manifest. The food **backend** is a separate concern: the `@pops/food` pillar (`pillars/food/src`) serves its own ts-rest contract and self-registers with the `registry` pillar on boot. There is no `backend.router` slot on the frontend manifest and no migration-descriptor slot; the pillar owns its SQLite DB and migrations independently.

`src/index.ts` re-exports `manifest`, `routes`, `navConfig`, plus shared components (RecipeRenderer, IngredientChip, DslEditor, etc.) and DSL helpers for downstream consumers.

## Routes & Nav Config

`src/routes.tsx` exports `routes: RouteObject[]` (all pages lazy-loaded) and `navConfig` (`satisfies AppNavConfigShape`, a local mirror of the shell's canonical nav type — a direct dependency on `@pops/navigation` would re-introduce a build cycle). Nav config: `id='food'`, `basePath='/food'`, `icon='Utensils'`, `color='amber'`, with sidebar items for Home, Recipes, Inbox, Plan, Fridge, Solve, Shopping, Manage data, Prompts. Each nav item carries an `i18n` `labelKey` under the `food` namespace.

Route table (relative to `/food`): index landing; `recipes` (+ `new`, `:slug`, `:slug/v/:versionNo`, `:slug/edit`, `:slug/drafts`, `:slug/drafts/:draftNo`); `data` layout (redirect to `ingredients`, plus `aliases`, `prep-states`, `substitutions`, `substitutions/graph`, `conversions`, `tags`); `inbox` (+ `:sourceId` inspector); `plan`; `fridge`; `solve`; `shopping/from-plan`; `prompts`. Individual surfaces are owned by their respective PRDs; this PRD owns the table wiring and the index landing page.

## Landing Page

`pages/FoodLandingPage.tsx` is the `/food` index. It is a pure-render placeholder (no `useQuery`/`useMutation`): an i18n heading + intro and two "coming soon" cards (Recipes, Manage data) in a responsive grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, collapses to one column below 640px). All copy comes from the `food` i18n namespace. It is still a stub even though every real surface now exists — see the idea file for the dashboard rework.

## Business Rules

- Package version starts at `0.1.0`; downstream PRDs do not bump it — versioning is repo-release automation, not per-PRD.
- The module `id` is `'food'`; it is the route base (`/food`) and the registry key.
- The shell mounts `food` purely from the registry-resolved manifest set — no shell code edit is required to add or remove the pillar. When the registry resolves a manifest with `surfaces` including `'app'`, the shell adds a `/food/*` route subtree and an app-rail nav entry; when it does not, no `/food` route is reachable.
- `navConfig` must `satisfies` the shell's `AppNavConfigShape` (id, label, labelKey, icon, color, basePath, items[]). Icon names are constrained to the shell's `IconName` union, mirrored locally.
- Routes use lazy imports so an unbuilt/erroring page never blocks the rest of the bundle.

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registry does not resolve the food manifest (pillar not registered / unreachable) | Shell renders the empty-snapshot branch for food; `/food` routes are absent and the catch-all handles direct nav.                      |
| Two manifests declare `id='food'`                                                 | Registry-level collision; standard registry behaviour, not handled here.                                                               |
| Direct nav to a `/food/*` route whose page is not yet wired                       | Lazy page resolves (placeholder pages render `null` until their PRD wires UI) or the router's catch-all renders the not-found surface. |
| A nav `labelKey` has no `food`-namespace translation                              | i18n falls back to the raw key; nav still renders.                                                                                     |

## Acceptance Criteria

- [x] `pillars/food/app` is a `@pops/app-food` workspace package (`type: module`, `main: src/index.ts`) with `tsconfig.json` extending the workspace base config.
- [x] `src/manifest.ts` exports `manifest` with `id='food'`, `surfaces=['app']`, `frontend.routes`, and `frontend.navConfig` populated; no `backend` slot.
- [x] `src/routes.tsx` exports `routes` (RouteObject[], index landing first) and `navConfig` (`satisfies AppNavConfigShape`, `basePath='/food'`).
- [x] `src/index.ts` re-exports `manifest`, `routes`, `navConfig`.
- [x] The shell discovers the manifest via the registry and mounts `/food` with no shell code change; when food is absent from the resolved manifest set, no `/food` route is reachable.
- [x] Nav sidebar shows a "Food" entry (Utensils icon, amber) with sub-items for every mounted surface.
- [x] `pages/FoodLandingPage.tsx` renders the placeholder landing: heading, intro, two coming-soon cards, responsive grid; pure render, no data fetching.
- [x] Vitest (`src/__tests__/manifest.test.ts`) asserts `manifest.id==='food'`, `surfaces` contains `'app'`, `frontend.routes`/`navConfig` are wired, `navConfig.basePath==='/food'`, the index route exists, and no backend slot is declared.
- [x] Vitest (`src/pages/__tests__/FoodLandingPage.test.tsx`) asserts the landing page renders heading + tile labels.
- [x] `pillars/food/app/README.md` describes the package and points at `pillars/food/docs/` for the spec.

## Out of Scope (own PRDs)

Recipe CRUD, DSL editor/renderer, data-management pages, conversion/admin, hero image upload, ingest/inbox, plan/fridge/solve/shopping — each owned by its surface PRD. The food **backend** (ts-rest contract, SQLite schema, ingest worker) is the `@pops/food` pillar, specified by its own PRDs. The landing-page dashboard rework is captured in `../../ideas/food-landing-dashboard.md`.
