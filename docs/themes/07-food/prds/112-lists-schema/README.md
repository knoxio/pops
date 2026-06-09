# PRD-112: Lists Schema (app-lists)

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the schema for a new generic lists package — `packages/app-lists` — that hosts shopping lists, packing lists, todo lists, and any future list-shaped feature. Food is the first consumer (its shopping list is a row in `lists` with `kind='shopping'`), but the package itself is domain-agnostic.

This PRD scaffolds the package and the two tables (`lists`, `list_items`). No UI, no list-domain logic — Epic 04 PRDs build the shopping-list specialisation; future themes (travel packing, generic todos) will write their own integrations.

## Package Scaffold

Create `packages/app-lists/`:

```
packages/app-lists/
  package.json                 # @pops/app-lists, follows existing app-* package conventions
  tsconfig.json
  src/
    index.ts                   # re-exports schema, services, types
    db/
      schema.ts                # Drizzle schema for lists, list_items
      services/
        lists.ts               # CRUD methods for lists
        list-items.ts          # CRUD methods for list items
    types.ts                   # public type exports
```

Mirror the structure of `packages/app-food/` (created during Epic 00 implementation). Manifest registration into the module registry happens in Epic 04 (the shell UI consumer side); this PRD just defines the package + schema.

## Data Model

### `lists`

```sql
CREATE TABLE lists (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('shopping','packing','todo','generic')),
  owner_app   TEXT NOT NULL,                       -- 'food' | 'travel' | 'user' | etc
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lists_kind      ON lists(kind);
CREATE INDEX idx_lists_owner_app ON lists(owner_app);
```

- `name`: human label ("Weekly groceries", "Cabin packing").
- `kind`: shape — drives UI affordances. `shopping` gets section grouping (Epic 04); `packing` gets check-off-by-category; `todo` gets due dates; `generic` is bare.
- `owner_app`: provenance — which app/domain created this list. `'food'` for food-generated shopping lists; `'user'` for manually-created lists from the lists UI itself. Filter column, not an isolation guarantee (single-user system).
- `archived_at`: soft delete. Archived lists hidden from default UI; not deleted.

The `kind` enum is intentionally small and closed. Adding a new kind = a small migration to extend the CHECK plus a UI PRD specifying its affordances. Per the [theme decisions](../../README.md#key-decisions), `app-lists` is generic; food only consumes `shopping`.

### `list_items`

```sql
CREATE TABLE list_items (
  id          INTEGER PRIMARY KEY,
  list_id     INTEGER NOT NULL REFERENCES lists(id),
  position    INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL,                        -- canonical display text
  qty         REAL,                                  -- optional quantity
  unit        TEXT,                                  -- optional unit ('g', 'count', etc.)
  ref_kind    TEXT NOT NULL DEFAULT 'free'
                CHECK (ref_kind IN ('free','ingredient','variant','recipe','custom')),
  ref_id      INTEGER,                               -- nullable; meaning depends on ref_kind
  checked     INTEGER NOT NULL DEFAULT 0,            -- 0/1 — checked-off state
  checked_at  TEXT,                                  -- when it was last checked
  due_at      TEXT,                                  -- optional due date (todo lists)
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_list_items_list      ON list_items(list_id);
CREATE INDEX idx_list_items_checked   ON list_items(list_id, checked);
CREATE INDEX idx_list_items_ref       ON list_items(ref_kind, ref_id) WHERE ref_id IS NOT NULL;
```

- `label` is required and is the human-readable text. For ingredient-derived items, the label is denormalised at insert time ("250g diced banana") so a later rename of the ingredient doesn't ghost-edit the list.
- `ref_kind` + `ref_id` is the polymorphic link back to source data:
  - `'free'`: ad-hoc item, `ref_id IS NULL`.
  - `'ingredient'`: `ref_id` = `ingredients.id` (PRD-106).
  - `'variant'`: `ref_id` = `ingredient_variants.id`.
  - `'recipe'`: `ref_id` = `recipes.id`.
  - `'custom'`: ref_id meaning is owner-app specific (escape hatch).
- No FK constraint on `ref_id` (polymorphic). Service layer is responsible for validity. Cascading deletes are not enforced at the schema level.
- `checked` defaults to 0; checking sets `checked=1, checked_at=datetime('now')`. Unchecking clears `checked_at`.
- `position` orders items within a list. Used for manual reordering; sections (for shopping) are derived from the ingredient's section tag at render time, not stored here.

## Business Rules

- Lists are **single-user** (matches POPS overall). `owner_app` is metadata, not access control.
- Deleting a list with extant `list_items` cascades via app-layer service (`deleteList(id)` runs `DELETE FROM list_items WHERE list_id = ?` then `DELETE FROM lists WHERE id = ?` in one transaction).
- Archiving a list is the normal path; hard-delete is for accidents.
- A list item's `label` is the source of truth for display. Even if `ref_kind='ingredient'`, the label is what shows — services that "send to shopping list" must compute the label at insert.
- Service layer is the only safe write path. Direct INSERTs into `list_items` that bypass the service may leave `label` empty or `ref_id` invalid.
- The `list-items.ts` service exposes `bulkAdd(listId, items[])` for the Epic 04 use case "send recipe ingredients to a shopping list" — one transaction, one round-trip.
- Concurrent edits on the same list rely on optimistic last-write-wins. Single-user means contention is rare.

## Edge Cases

| Case                                                                                          | Behaviour                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a list item with `ref_kind='ingredient'` and `ref_id` pointing to a deleted ingredient | No FK to enforce; row is inserted. Service may proactively validate; UI shows broken-ref icon.                                                           |
| Two items with the same `(list_id, position)`                                                 | Allowed by schema. Reorder service tries to keep positions unique; UI sorts by position then id.                                                         |
| Checking an item that's already checked                                                       | Idempotent — `checked` stays 1, `checked_at` updates to now (matches "I re-confirmed this"). Service may also choose to no-op; v1 updates the timestamp. |
| List with `kind='shopping'` but `owner_app='user'`                                            | Allowed — user manually created a shopping list. Food can `send to` it just fine.                                                                        |
| `due_at` set on a `kind='shopping'` item                                                      | Allowed — the column is generic. UI for shopping ignores it.                                                                                             |
| Archiving a list that has unchecked items                                                     | Allowed. Items remain unchecked when restored (un-archived).                                                                                             |
| Owner_app value not recognised by the UI                                                      | Allowed. UI degrades gracefully (shows list, no app-specific affordances).                                                                               |
| Creating a list with `kind` outside the CHECK list                                            | Fails the CHECK.                                                                                                                                         |
| Creating a list_item with `ref_kind='ingredient'` but `ref_id IS NULL`                        | Allowed at schema. Service may warn ("ingredient ref without ID — falling back to free"); v1 service treats it as `'free'`.                              |

## Acceptance Criteria

Inline per theme protocol.

### Package scaffold

- [x] `packages/app-lists/` created with `package.json` (name `@pops/app-lists`), `tsconfig.json`, and the `src/` skeleton described above.
- [x] Package added to `pnpm-workspace.yaml` (workspace lists packages explicitly; new entry required).
- [x] `mise typecheck` includes the new package.

### Schema

- [x] Migration adds `lists` and `list_items` per the SQL above.
- [x] Migration file generated under `apps/pops-api/src/db/drizzle-migrations/` per the drizzle-kit flow (see `MIGRATIONS_FROZEN.md`); the legacy hand-written `src/db/migrations/` directory is no longer used.
- [x] Per-module ownership tag (PRD-101) declared so Lists migrations are gated on the lists module being installed (the food package will declare a dependency).
- [x] `packages/db-types` regenerated to export the new tables.

### Service layer

- [x] `packages/app-lists/src/db/services/lists.ts` exposes: `createList`, `archiveList`, `unarchiveList`, `deleteList`, `getList`, `listLists` (filtered by kind / owner_app).
- [x] `packages/app-lists/src/db/services/list-items.ts` exposes: `addItem`, `bulkAdd`, `updateItem`, `removeItem`, `checkItem`, `uncheckItem`, `reorderItems`.
- [x] `bulkAdd` is one transaction (no N+1 inserts).

### Invariants (each verified by Vitest)

- [x] Inserting a list with `kind='foo'` fails the CHECK.
- [x] Inserting a `list_item` with `ref_kind='foo'` fails the CHECK.
- [x] `deleteList` removes all `list_items` for that list in the same transaction.
- [x] `checkItem` sets `checked=1` and `checked_at` to now; `uncheckItem` reverts.
- [x] `bulkAdd` of 50 items completes in one transaction (asserted via timing or transaction-id check).

### Tests

- [x] Vitest suite at `packages/app-lists/src/db/__tests__/lists.test.ts` covers each invariant and the bulkAdd path.

## Out of Scope

- Lists UI (CRUD pages, item check-off interactions, mobile layout) — Epic 04 PRD.
- Shopping-list specialisation (section grouping, store-section ingredient tags, sorting by aisle) — Epic 04 PRD.
- The food → lists "send to shopping list" action — Epic 04 PRD (food side) + this PRD's `bulkAdd` API.
- Pantry-aware list generation — Epic 07 PRD.
- Recurring / template lists — deferred.
- Sharing / collaboration — single-user system.
- Notifications for `due_at` items — none in v1 (matches theme decision).
- Search across lists — deferred.
- Module manifest registration into the shell — Epic 04 (consumer side).
