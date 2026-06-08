# @pops/app-food

Food domain frontend module: recipes, ingredients, meal planning, and multimodal ingestion.

## Status

Scaffold only. Pages, services, schema, and tRPC procedures arrive incrementally per
the food theme PRDs.

- Spec: [`docs/themes/07-food/`](../../docs/themes/07-food/) — theme README, epics, and PRDs.
- This package: [PRD-118](../../docs/themes/07-food/prds/118-app-food-scaffold/README.md).

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
a frontend-only shape; the `backend.router` slot is filled when PRD-119 lands.

## Install gate

`POPS_APPS` controls whether the module mounts. Adding `food` to the comma-separated
list makes the shell pick up this manifest at boot; removing it makes the routes
disappear (data stays untouched).
