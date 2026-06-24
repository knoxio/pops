# Lists pillar — docs

The **lists** pillar owns generic, domain-agnostic lists. A list is a header
(`name`, `kind`, `owner_app`) plus an ordered set of `list_items`. It is not a
shopping app, a todo app, or a packing app — it is the substrate all of those
shapes are built on. The `kind` enum (`shopping` | `packing` | `todo` |
`generic`) selects which UI affordances a list gets; the data model is identical
across kinds.

Lists is a leaf domain: it depends on no other pillar. Other pillars depend on
it. Food is the first consumer — a food shopping list is a `lists` row with
`kind='shopping'`, and food pushes recipe ingredients into it through the
cross-pillar SDK. Lists itself knows nothing about food, ingredients, or
recipes; the `ref_kind` enum values (`ingredient`, `variant`, `recipe`) are
opaque integer pointers it never dereferences.

## What's here

| Doc                                                                    | Scope                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [prds/schema](prds/schema/README.md)                                   | `lists` + `list_items` tables, the polymorphic `ref_kind`/`ref_id` link, archive/delete rules. |
| [prds/shell-module](prds/shell-module/README.md)                       | The `lists` module manifest, `/lists` route registration, sidebar entry.                       |
| [prds/crud-ui](prds/crud-ui/README.md)                                 | The generic `/lists` index + `/lists/:id` detail UI — kind-agnostic list and item CRUD.        |
| [prds/shopping-specialisation](prds/shopping-specialisation/README.md) | The `kind='shopping'` UX layer: uncheck-all, clear-checked, sort modes, touch-tuned rows.      |
| [ideas/](ideas/)                                                       | Unbuilt directions (todo/packing specialisations, section grouping, templates).                |

## Architecture at a glance

- **Pillar:** independent REST service on port `3006`. Owns its own SQLite DB.
  Self-registers with the `registry` pillar on boot.
- **Contract:** ts-rest + zod, the single source of truth, under
  `src/contract/rest-*.ts`. Projected to `openapi/lists.openapi.json`. The two
  sub-routers are `list.*` (header CRUD + the aggregate index) and `items.*`
  (item CRUD + bulk + shopping bulk ops).
- **Frontend:** `pillars/lists/app` — the SPA module mounted by `pillars/shell`
  at `/lists`. Index page, generic detail page, and the shopping specialisation
  all live here.
- **Cross-pillar consumption:** TS consumers call `pillar('lists').list.create(…)`
  / `pillar('lists').items.bulkAdd(…)` via `@pops/pillar-sdk`; non-TS consumers
  read `openapi/lists.openapi.json` and call HTTP directly. There is no exported
  router type — the wire contract is the boundary.

## REST surface

Base path is the pillar root (port `3006`).

### Lists — `list.*`

| Method   | Path                   | Purpose                                                                                                                                  |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/lists`               | Aggregate index (`itemCount`, `uncheckedCount`, `lastUpdatedAt`); filter by `kinds`, `includeArchived`; sort `updated`/`name`/`created`. |
| `GET`    | `/lists/:id`           | One header plus its items in a single round-trip.                                                                                        |
| `POST`   | `/lists`               | Create (`name`, `kind`, optional `ownerApp` — defaults `user`).                                                                          |
| `PATCH`  | `/lists/:id`           | Rename and/or change kind.                                                                                                               |
| `POST`   | `/lists/:id/archive`   | Soft-delete.                                                                                                                             |
| `POST`   | `/lists/:id/unarchive` | Restore.                                                                                                                                 |
| `DELETE` | `/lists/:id`           | Hard-delete (cascades items).                                                                                                            |

### Items — `items.*`

| Method   | Path                                 | Purpose                                                                                      |
| -------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `GET`    | `/items`                             | Search across lists (`kind`, `listId`, `includeArchived`, `labelContains`, `notesContains`). |
| `POST`   | `/lists/:listId/items`               | Add one item.                                                                                |
| `POST`   | `/lists/:listId/items/bulk`          | Add many in one transaction.                                                                 |
| `POST`   | `/lists/:listId/items/upsert-by-ref` | Atomic merge-or-insert keyed on `(refKind, refId)`.                                          |
| `PATCH`  | `/items/:id`                         | Patch label / qty / unit / notes.                                                            |
| `POST`   | `/items/:id/check`                   | Mark checked (returns `checkedAt`).                                                          |
| `POST`   | `/items/:id/uncheck`                 | Mark unchecked.                                                                              |
| `DELETE` | `/items/:id`                         | Remove (idempotent).                                                                         |
| `POST`   | `/lists/:listId/items/reorder`       | Reorder within a list (one transaction).                                                     |
| `POST`   | `/lists/:listId/items/uncheck-all`   | Uncheck every checked item (returns `count`).                                                |
| `DELETE` | `/lists/:listId/items/checked`       | Hard-delete every checked item (returns `removedCount`).                                     |

The last two are kind-agnostic at the API level; the UI surfaces them only for
`kind='shopping'`.
</content>
