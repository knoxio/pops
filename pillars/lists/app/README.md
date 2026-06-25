# lists — frontend module

The shell-side frontend for the lists pillar — the `/lists` index and
`/lists/:id` detail pages plus the `kind='shopping'` specialisation. Talks to
the lists pillar over its generated REST client. Domain-agnostic: shopping,
packing, todo, generic. Food is the first consumer (its shopping list is a row
in `lists` with `kind='shopping'`); future surfaces (travel packing, generic
todos) compose the same pages.

## Status

Built: the index page, the generic detail page, and the shopping specialisation
(uncheck-all, clear-checked, sort modes, touch-tuned rows). Backed by the lists
pillar's REST contract.

- Domain overview: [`pillars/lists/docs/`](../docs/README.md)
- Schema spec: [lists schema](../docs/prds/schema.md)
- Shell module spec: [lists shell module](../docs/prds/shell-module.md)
- CRUD UI spec: [generic lists CRUD UI](../docs/prds/crud-ui.md)
- Shopping specialisation: [shopping list specialisation](../docs/prds/shopping-specialisation.md)

## Layout

```
src/
  index.ts                       frontend entrypoint — manifest, navConfig, routes
  manifest.ts                    ModuleManifest declaration (id='lists')
  routes.tsx                     routes + navConfig
  pages/
    ListsIndexPage.tsx           /lists — filterable list of all lists (PRD-140 part B)
    lists-index/                 sub-components for the index page
      ListRow.tsx                  index row card
      ListKindChip.tsx             kind badge
      ListsIndexFilters.tsx        kind chips + archive toggle + sort
      ListNewModal.tsx             "+ New list" modal (URL ?new=1)
      KindRadioGroup.tsx           kind picker for the modal
      useListsIndexQuery.ts        wraps trpc.lists.list.list.useQuery
      list-index-types.ts          shared filter types + constants
      __tests__/                   vitest + RTL coverage
    __tests__/
      ListsIndexPage.test.tsx    page-level integration
  test-setup.ts                  vitest setup (jsdom + i18n + ResizeObserver stub)
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

The split keeps the shell bundle free of server-only deps. Same
frontend-vs-server separation `@pops/app-food` + `@pops/app-food-db`
achieve as two sibling packages — collapsed into one package + subpath
export for app-lists because the server surface is smaller.

Migrations live with the canonical schema at `apps/pops-api/src/db/drizzle-migrations/`
and are owned by the `lists` module per `apps/pops-api/src/db/migration-ownership.ts`.

## Install gate

`POPS_APPS` controls whether the module mounts. Adding `lists` to the
comma-separated list makes the shell pick up this manifest at boot; removing
it makes `/lists` disappear. Data tables persist on uninstall.
