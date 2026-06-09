# @pops/app-lists

Generic lists module — hosts the `lists` and `list_items` tables, a pure
service layer over them, and the shell-side frontend scaffold (`/lists`).
Domain-agnostic: shopping lists, packing lists, todo lists. Food is the first
consumer (its shopping list is a row in `lists` with `kind='shopping'`); future
themes (travel packing, generic todos) compose the same surface.

## Status

Schema + service layer (PRD-112) and frontend shell module (PRD-139) only.
Generic lists CRUD UI lands in PRD-140; shopping-list specialisation in
PRD-141; food → shopping-list send action in PRD-142.

- Schema spec: [PRD-112](../../docs/themes/07-food/prds/112-lists-schema/README.md)
- Shell module spec: [PRD-139](../../docs/themes/07-food/prds/139-app-lists-shell-module/README.md)
- Theme: [`docs/themes/07-food/`](../../docs/themes/07-food/) — note the lists
  module itself is theme-agnostic; the food theme just happens to be the first
  driver.

## Layout

```
src/
  index.ts                       frontend entrypoint — manifest, navConfig, routes
  manifest.ts                    ModuleManifest declaration (id='lists')
  routes.tsx                     routes + navConfig
  pages/
    ListsLandingPage.tsx         placeholder /lists landing
    __tests__/
      ListsLandingPage.test.tsx  render smoke
  test-setup.ts                  vitest setup (jsdom + i18n)
  __tests__/
    manifest.test.ts             PRD-139 manifest shape
  db/                            PRD-112 — server-only schema + services
    index.ts                     @pops/app-lists/db entrypoint
    schema.ts                    re-exports tables from @pops/db-types
    errors.ts                    typed errors raised by the service layer
    services/
      internal.ts                shared helpers (ListsDb, expectRow)
      lists.ts                   list CRUD
      list-items.ts              item CRUD + bulkAdd + check/uncheck/reorder
    __tests__/
      lists.test.ts              invariant suite (PRD-112 AC)
```

## Entrypoints

| Import               | Use case                                                                            |
| -------------------- | ----------------------------------------------------------------------------------- |
| `@pops/app-lists`    | Frontend — manifest, navConfig, routes. Browser-safe.                               |
| `@pops/app-lists/db` | Server — schema, services, typed errors, `ListsDb`. Pulls drizzle + better-sqlite3. |

The split keeps the shell bundle free of server-only deps. Mirrors the
`@pops/app-food` + `@pops/app-food/server` convention.

Migrations live with the canonical schema at `apps/pops-api/src/db/drizzle-migrations/`
and are owned by the `lists` module per `apps/pops-api/src/db/migration-ownership.ts`.

## Install gate

`POPS_APPS` controls whether the module mounts. Adding `lists` to the
comma-separated list makes the shell pick up this manifest at boot; removing
it makes `/lists` disappear. Data tables persist on uninstall.
