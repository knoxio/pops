# Lists schema

## Purpose

Define the persistence layer for the lists pillar: a generic list header
(`lists`) and its ordered, polymorphic items (`list_items`). The model is
domain-agnostic. A shopping list, a packing list, a todo list, and a bare
generic list are all the same two tables — `kind` selects affordances at the UI
layer, not the storage layer.

Food is the first consumer: a food shopping list is a `lists` row with
`kind='shopping'`, and food pushes ingredient rows into `list_items` through the
cross-pillar SDK. The schema never dereferences those references; `ref_kind` /
`ref_id` are opaque to lists.

## Data model

### `lists`

```sql
CREATE TABLE lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('shopping','packing','todo','generic')),
  owner_app   TEXT NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lists_kind      ON lists(kind);
CREATE INDEX idx_lists_owner_app ON lists(owner_app);
```

- `name` — human label ("Weekly groceries", "Cabin packing").
- `kind` — shape selector. Drives UI affordances only. `shopping` gets the
  specialised header/rows (see [shopping-specialisation](../shopping-specialisation/README.md));
  the other three render via the generic path.
- `owner_app` — provenance. `'food'` for food-generated shopping lists; `'user'`
  for lists created from the lists UI itself. A filter column, not access
  control — the system is single-user.
- `archived_at` — soft delete. Archived lists are hidden from the default index;
  the row is retained.

The `kind` enum is small and closed. Adding a value is a migration to extend the
CHECK plus a UI decision about its affordances.

### `list_items`

```sql
CREATE TABLE list_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id     INTEGER NOT NULL REFERENCES lists(id),
  position    INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL,
  qty         REAL,
  unit        TEXT,
  ref_kind    TEXT NOT NULL DEFAULT 'free'
                CHECK (ref_kind IN ('free','ingredient','variant','recipe','custom')),
  ref_id      INTEGER,
  checked     INTEGER NOT NULL DEFAULT 0,
  checked_at  TEXT,
  due_at      TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_list_items_list    ON list_items(list_id);
CREATE INDEX idx_list_items_checked ON list_items(list_id, checked);
CREATE INDEX idx_list_items_ref     ON list_items(ref_kind, ref_id);
```

- `label` is required and is the canonical display text. For reference-backed
  items the label is **denormalised at insert** ("250g diced banana") so a later
  rename of the source entity does not ghost-edit the list.
- `ref_kind` + `ref_id` is the polymorphic link back to source data:
  - `'free'` — ad-hoc item, `ref_id IS NULL`.
  - `'ingredient'` / `'variant'` / `'recipe'` — `ref_id` points at a food
    entity. Lists treats these as opaque integers; it never joins on them.
  - `'custom'` — `ref_id` meaning is consumer-specific (escape hatch).
- There is **no FK on `ref_id`** (it is polymorphic). The service layer owns
  validity. No cascade is enforced at the schema level.
- `checked` is 0/1. Checking sets `checked=1, checked_at=datetime('now')`;
  unchecking sets `checked=0, checked_at=NULL`.
- `position` orders items within a list for manual reordering.
- `due_at` exists for a future todo specialisation. It has **no write path in
  the current contract** — no endpoint sets it. It is a reserved column, not a
  live feature.

## Rules

- Single-user system. `owner_app` is metadata, never an isolation guarantee.
- Deleting a list cascades its items **in one transaction at the service layer**
  (`deleteList` deletes child `list_items` then the `lists` row) — there is no FK
  CASCADE. Deleting an unknown id is a no-op.
- Archiving is the normal "remove from view" path; hard-delete is for accidents.
- A list item's `label` is the source of truth for display. Even when
  `ref_kind='ingredient'`, the denormalised label is what renders — any
  "send to list" producer computes the label at insert time.
- The service layer is the only safe write path. Direct INSERTs that bypass it
  may leave `label` empty or `ref_id` invalid.
- `bulkAdd(listId, items[])` inserts the whole batch in one transaction (no
  N+1). It backs the "send a recipe's ingredients to a shopping list" use case.
- `upsertItemByRef` is the atomic merge-or-insert keyed on
  `(listId, ref_kind, ref_id)`; `ref_kind` cannot be `'free'` (free rows have no
  identity to dedupe on). On conflict: `merge-additive` (default — adds qty,
  appends notes with `\n`, replaces label, keeps unit), `replace` (overwrites
  label/qty/unit/notes), or `skip` (no-op).
- Concurrent edits are last-write-wins. Single-user means contention is rare.

## Edge cases

| Case                                                               | Behaviour                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Insert a list with `kind='foo'`                                    | Fails the CHECK.                                                                                  |
| Insert a `list_item` with `ref_kind='foo'`                         | Fails the CHECK.                                                                                  |
| Item with `ref_kind='ingredient'` pointing at a deleted source row | Allowed — no FK to enforce. The label is already denormalised, so the row still renders.          |
| Two items share `(list_id, position)`                              | Allowed by schema; the read path sorts by `position ASC, id ASC` so order is still deterministic. |
| Check an already-checked item                                      | `checked` stays 1; `checked_at` updates to now.                                                   |
| `kind='shopping'`, `owner_app='user'`                              | Allowed — a user manually made a shopping list; food can still send into it.                      |
| `due_at` set on a `kind='shopping'` item                           | Allowed by schema; no contract endpoint writes it, and the UI ignores it.                         |
| Archive a list with unchecked items                                | Allowed; items keep their state when unarchived.                                                  |
| `owner_app` value the UI doesn't recognise                         | Allowed; UI degrades gracefully (no app-specific affordances).                                    |

## Acceptance criteria

### Schema

- [x] `lists` table exists with the columns, CHECK on `kind`, and the
      `idx_lists_kind` / `idx_lists_owner_app` indexes above
      (`src/db/schema/lists.ts`).
- [x] `list_items` table exists with the columns, CHECK on `ref_kind`, and the
      `idx_list_items_list` / `idx_list_items_checked` / `idx_list_items_ref`
      indexes above.
- [x] `ref_kind` defaults to `'free'`; `checked` defaults to `0`; `position`
      defaults to `0`; `created_at` defaults to `datetime('now')`.
- [x] `list_items.list_id` references `lists(id)`; no FK on `ref_id`.

### Service layer

- [x] List services expose `createList`, `getList`, `listLists` (filter by
      kind / owner_app / includeArchived), `updateList`, `archiveList`,
      `unarchiveList`, `deleteList` (`src/db/services/lists.ts`).
- [x] Item services expose add, bulk add, update, check, uncheck, remove,
      reorder, uncheck-all, remove-checked, search, and upsert-by-ref
      (`src/db/services/list-items*.ts`).
- [x] `deleteList` removes all child `list_items` and the header in one
      transaction.
- [x] `bulkAdd` inserts the batch in a single transaction (no N+1).
- [x] `checkListItem` sets `checked=1` and `checked_at`; `uncheckListItem`
      reverts both.
- [x] `upsertItemByRef` merges/inserts atomically on `(listId, refKind, refId)`
      and honours `merge-additive` / `replace` / `skip`; rejects `ref_kind='free'`
      at the type level.

### Tests

- [x] Vitest covers the CHECK invariants, the cascade delete, check/uncheck, the
      bulk-add transaction, and the upsert conflict modes
      (`src/db/__tests__/lists.test.ts`, `list-items.test.ts`).
      </content>
