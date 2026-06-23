# Wishlist

> Status: Done

Savings goals with target amounts, progress tracking, and priority levels. Users add items they want to buy, set a target price, record how much they've saved, and see progress toward each goal.

## Data Model

### `wish_list`

| Column             | Type | Constraints      | Description                                       |
| ------------------ | ---- | ---------------- | ------------------------------------------------- |
| `id`               | TEXT | PK, UUID         | Generated server-side                             |
| `notion_id`        | TEXT | nullable, unique | Owned by the import/sync layer, not user-editable |
| `item`             | TEXT | NOT NULL         | Item description                                  |
| `target_amount`    | REAL | nullable         | Total cost target                                 |
| `saved`            | REAL | nullable         | Amount saved so far                               |
| `priority`         | TEXT | nullable         | One of: `Needing`, `Soon`, `One Day`, `Dreaming`  |
| `url`              | TEXT | nullable         | Link to the item                                  |
| `notes`            | TEXT | nullable         |                                                   |
| `last_edited_time` | TEXT | NOT NULL         | ISO 8601, set on create and on every write        |

**Computed (response only, not stored):** `remainingAmount = targetAmount - saved`, or `null` if either operand is `null`.

## REST API

ts-rest contract (`src/contract/rest-wishlist.ts`), camelCase wire shape, paginated `{ data, pagination }` envelope on list.

| Method + Path          | Body / Query                                                     | Result                                 |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `GET /wishlist`        | `search?`, `priority?`, `limit`, `offset`                        | `{ data: WishListItem[], pagination }` |
| `GET /wishlist/:id`    | —                                                                | `{ data: WishListItem }`               |
| `POST /wishlist`       | `item`, `targetAmount?`, `saved?`, `priority?`, `url?`, `notes?` | `201 { data, message }`                |
| `PATCH /wishlist/:id`  | same fields, all optional (PATCH semantics)                      | `{ data, message }`                    |
| `DELETE /wishlist/:id` | —                                                                | `{ message }`                          |

`WishListItem` = id, item, targetAmount, saved, remainingAmount, priority, url, notes, lastEditedTime.

## Business Rules

- `remainingAmount` is derived in the response (`target - saved`); `null` if either side is `null` — no implicit zero.
- `url`, if provided, must pass URL validation (`z.string().url()`); empty string is rejected, so the FE coerces empty input to `null`.
- `priority` is a 4-value enum: `Needing`, `Soon`, `One Day`, `Dreaming`.
- List is ordered by `item` ASC; `search` matches `item` (LIKE), `priority` filters by exact value.
- `last_edited_time` is set server-side on create and refreshed on any non-empty PATCH; a PATCH with no changed fields re-reads the row without an UPDATE.
- An unknown `priority` filter value returns an empty page (preserves the legacy exact-match semantic) rather than all rows.

## UI

Wishlist page (`app/src/pages/WishlistPage.tsx`) — a DataTable plus create/edit/delete dialogs (React Hook Form + Zod).

- **Columns:** Item (with external-link affordance when `url` is set, opens in a new tab), Priority (badge; `Needing`→default, `Soon`→secondary, others→outline; `—` when null), Target, Saved, Progress, Actions dropdown (Edit / Delete).
- **Progress:** `min(100, round(saved / target * 100))` rendered as a progress bar + percentage; shown only when both `target` and `saved` are non-null and `target ≠ 0`, else `—`.
- **Search & filter:** search by item name; filter by priority via select (`All Priorities` + 4 levels).
- **Loading / empty:** skeleton while loading; error panel with retry; header count text.
- **Create/edit dialog:** item name (required), target amount (number), saved amount (number), priority (select), URL (validated, optional), notes. Edit reuses the same form pre-filled.
- **Delete:** confirmation AlertDialog.
- **Feedback:** toast on create / update / delete; submit/delete buttons disable and spin during the mutation; the list query is invalidated on settle so the table refreshes.

## Acceptance Criteria

- [x] `wish_list` table with all columns; `id` is a server-generated UUID, `last_edited_time` is server-managed.
- [x] CRUD over REST: list (search + priority filter + pagination), get, create, update (PATCH), delete.
- [x] `url` validated on create/update when provided; empty string rejected by the contract.
- [x] `priority` enum enforced to the 4 levels on create/update.
- [x] `remainingAmount` computed in every response (`null` when target or saved is null).
- [x] Unknown `priority` filter yields an empty page, not all rows.
- [x] Wishlist page DataTable with item/priority/target/saved/progress/actions columns.
- [x] Progress bar capped at 100%, hidden when target or saved is null or target is 0.
- [x] External link opens the item URL in a new tab when present.
- [x] Create / edit / delete dialogs with form validation, toasts, mutation-pending button state, and table refresh on settle.

## Out of Scope

- Price tracking or alerts.
- Linking purchased items to inventory.
- Automatic `saved` updates derived from transactions.
