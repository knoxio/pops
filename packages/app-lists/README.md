# @pops/app-lists

Generic lists package — hosts the `lists` and `list_items` tables and a pure
service layer over them. Domain-agnostic: shopping lists, packing lists, todo
lists. Food is the first consumer (its shopping list is a row in `lists` with
`kind='shopping'`); future themes (travel packing, generic todos) compose the
same surface.

## Status

Schema + service layer only. UI (`/lists`) and the food → shopping-list send
action arrive in Epic 04 of the food theme.

- Spec: [PRD-112](../../docs/themes/07-food/prds/112-lists-schema/README.md)
- Theme: [`docs/themes/07-food/`](../../docs/themes/07-food/)

## Layout

```
src/
  index.ts                       public exports (schema, services, types)
  db/
    schema.ts                    re-exports tables from @pops/db-types
    errors.ts                    typed errors raised by the service layer
    services/
      internal.ts                shared helpers (ListsDb, expectRow)
      lists.ts                   list CRUD
      list-items.ts              item CRUD + bulkAdd + check/uncheck/reorder
    __tests__/
      lists.test.ts              invariant suite (PRD-112 AC)
```

Migrations live with the canonical schema at `apps/pops-api/src/db/drizzle-migrations/`
and are owned by the `lists` module per `apps/pops-api/src/db/migration-ownership.ts`.
