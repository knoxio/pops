# @pops/app-lists

The frontend module for the lists pillar. It registers the `/lists` index and
`/lists/:id` detail pages with `pillars/shell` and adds the shopping
specialisation (uncheck-all, clear-checked, sort modes, touch-tuned rows).

Domain-agnostic: a list is `{ name, kind, owner_app }` plus ordered items, and
`kind` (`shopping` | `packing` | `todo` | `generic`) selects which UI
affordances render. Food is the first consumer — a food shopping list is a
`lists` row with `kind='shopping'`.

Frontend-only: this package owns no database. All CRUD goes over the lists
pillar's REST contract through the generated `@hey-api/client-fetch` client in
`src/lists-api/`, served at the shell's `/lists-api` proxy path
(see `src/lists-api-runtime-config.ts`).

## Layout

```
src/
  index.ts                     entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                  ModuleManifest (id='lists')
  routes.tsx                   route table + navConfig
  lists-api/                   generated Hey API client (do not hand-edit)
  lists-api-helpers.ts         unwrap() + shared client helpers
  lists-api-runtime-config.ts  client baseUrl ('/lists-api')
  pages/
    ListsIndexPage.tsx         /lists — filterable index of all lists
    lists-index/               index sub-components (rows, filters, new-list modal)
    ListDetailPage.tsx         /lists/:id — kind-aware detail page
    detail/                    generic detail sub-components + mutation hooks
    components/shopping/        kind='shopping' UX (add form, swipe-delete, sort, bulk ops)
```

The generated client under `src/lists-api/` is produced from
`pillars/lists/openapi/lists.openapi.json` and must not be edited by hand.
Regenerate it with `generate:lists-client` after the contract changes.

## Run

```sh
pnpm --filter @pops/app-lists typecheck          # tsc --noEmit
pnpm --filter @pops/app-lists test               # vitest run
pnpm --filter @pops/app-lists test:watch         # vitest (watch)
pnpm --filter @pops/app-lists test:coverage      # vitest run --coverage
pnpm --filter @pops/app-lists generate:lists-client  # regen src/lists-api from the OpenAPI spec
```

## Install gate

`@pops/app-lists` exposes a single `.` export — `manifest`, `navConfig`, and
`routes`, all browser-safe. `pillars/shell` imports the `manifest` and gates
mounting on its `POPS_APPS` selection: adding `lists` mounts the module at
`/lists`, removing it hides those routes. No data lives in this package, so
uninstalling only removes the UI — list data stays in the lists pillar.

## Docs

- Domain overview: [`pillars/lists/docs/README.md`](../docs/README.md)
- Schema: [`pillars/lists/docs/prds/schema.md`](../docs/prds/schema.md)
- Shell module: [`pillars/lists/docs/prds/shell-module.md`](../docs/prds/shell-module.md)
- Generic CRUD UI: [`pillars/lists/docs/prds/crud-ui.md`](../docs/prds/crud-ui.md)
- Shopping specialisation: [`pillars/lists/docs/prds/shopping-specialisation.md`](../docs/prds/shopping-specialisation.md)
