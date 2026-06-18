# @pops/app-food

Food domain frontend module: recipes, ingredients, meal planning, and multimodal ingestion.

## Status

Scaffold only. Pages, services, schema, and tRPC procedures arrive incrementally per
the food theme PRDs.

- Spec: [`pillars/food/docs/`](../../pillars/food/docs/) — theme README, epics, and PRDs.
- This package: [PRD-118](../../pillars/food/docs/prds/118-app-food-scaffold/README.md).

## Layout

```
src/
  index.ts              public exports (manifest, navConfig, routes)
  manifest.ts           ModuleManifest declaration (id='food')
  routes.tsx            routes + navConfig
  pages/                page components (lazy-loaded)
  components/           shared cross-page components
  hooks/                shared hooks
  lib/                  utilities
  test-setup.ts         vitest setup (jsdom + i18n)
```

Backend services (`src/db/schema.ts`, `src/db/services/*.ts`, `src/dsl/*.ts`) are
populated by Epic 00 implementation (PRDs 106–117). Until then, the manifest exposes
a frontend-only shape; the `backend.router` slot is filled when PRD-106 lands (the
first Epic 00 PRD — it ships a stub router alongside the slug-registry migration,
because `ModuleBackendManifest.router` is required when `backend` is set). PRD-119
later extends that router with the recipe-CRUD procedures.

## Install gate

`POPS_APPS` controls whether the module mounts. Adding `food` to the comma-separated
list makes the shell pick up this manifest at boot; removing it makes the routes
disappear (data stays untouched).
