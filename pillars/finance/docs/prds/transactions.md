# Transactions

> Status: Done

The transaction ledger — the core of the finance pillar. Every financial transaction across all bank accounts lives in finance's own SQLite DB. Full CRUD, paginated/filterable listing, a delete/restore (Undo) handshake, rule-based tag suggestion, inline tag editing, and a read-only dashboard.

## Data Model

### `transactions`

| Column                   | Type | Constraints               | Notes                                                                                         |
| ------------------------ | ---- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                     | TEXT | PK, `crypto.randomUUID()` | Generated on create                                                                           |
| `notion_id`              | TEXT | UNIQUE, nullable          | Legacy import/sync correlation id; indexed                                                    |
| `description`            | TEXT | NOT NULL                  | Raw merchant/payee description from bank                                                      |
| `account`                | TEXT | NOT NULL                  | Account identifier (e.g. "ANZ Everyday", "Amex")                                              |
| `amount`                 | REAL | NOT NULL                  | Negative = expense, positive = income                                                         |
| `date`                   | TEXT | NOT NULL                  | `YYYY-MM-DD`                                                                                  |
| `type`                   | TEXT | NOT NULL                  | "Expense" / "Income" / "Transfer" (capitalised); create defaults to `''` at the service layer |
| `tags`                   | TEXT | NOT NULL, default `'[]'`  | JSON array of tag strings                                                                     |
| `entity_id`              | TEXT | nullable                  | Contact id (contacts pillar) — NO FK; finance keeps no mirror                                 |
| `entity_name`            | TEXT | nullable                  | Denormalised entity name (survives entity deletion)                                           |
| `location`               | TEXT | nullable                  | Geographic location                                                                           |
| `country`                | TEXT | nullable                  | Country code                                                                                  |
| `related_transaction_id` | TEXT | nullable                  | Links paired transfers                                                                        |
| `notes`                  | TEXT | nullable                  | User annotations                                                                              |
| `checksum`               | TEXT | UNIQUE, nullable          | Dedup hash of the raw CSV row (import pipeline)                                               |
| `raw_row`                | TEXT | nullable                  | Full CSV row as JSON (audit trail)                                                            |
| `last_edited_time`       | TEXT | NOT NULL                  | ISO 8601; updated on any patch                                                                |

**Indexes:** `date`, `account`, `entity_id`, `last_edited_time`, `notion_id`, and a UNIQUE index on `checksum`.

Entities are owned by the **contacts** pillar — there is no foreign key and no entity mirror table here. `entity_name` is denormalised so a deleted/unknown contact still renders. The entity-default tags used by suggestion are fetched live from contacts over the pillar SDK, not from a local copy.

Online-vs-in-person is NOT a column — it is expressed only as a normal tag (one model, one mechanism via `transaction_tag_rules`).

## REST API

ts-rest (zod) contract under `pillars/finance/src/contract/rest-transactions.ts`, served by the finance pillar and projected to OpenAPI.

| Method & Path                            | Purpose                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /transactions`                      | List; filters `search, account, startDate, endDate, tag, entityId, type`; `limit` (default 50) / `offset` (default 0); ordered by `date` DESC; returns `{ data, pagination }` |
| `GET /transactions/:id`                  | Single transaction; 404 if missing                                                                                                                                            |
| `POST /transactions`                     | Create; generates UUID, sets `last_edited_time`; 201                                                                                                                          |
| `PATCH /transactions/:id`                | Partial update; only provided fields change; bumps `last_edited_time`                                                                                                         |
| `DELETE /transactions/:id`               | Hard delete; returns `{ message, snapshot }` (full row) for Undo                                                                                                              |
| `POST /transactions/restore`             | Re-insert a delete snapshot (preserves `id`, `checksum`, `raw_row`, `notion_id`); 409 if id already present                                                                   |
| `GET /transactions/suggest-tags`         | Rule-based tag suggestions for `description`(+`entityId`); no LLM call                                                                                                        |
| `GET /transactions/available-tags`       | Distinct, sorted tags across all transactions (autocomplete)                                                                                                                  |
| `GET /transactions/descriptions-preview` | `{ description, checksum }[]` (+ `total`, `truncated`) for client-side rule preview                                                                                           |

Literal sub-paths (`suggest-tags`, `available-tags`, `descriptions-preview`, `restore`) are declared before `:id` so the param route never shadows them.

### Wire shape

`list`/`get`/`create`/`update`/`restore` return the camelCase `Transaction` (tags parsed to `string[]`, no `checksum`/`raw_row`/`notion_id`). `delete`/`restore` carry the full **snapshot** shape — original `id`, `notionId`, raw `tags` JSON string, `checksum`, `rawRow` — so an Undo restores everything a re-import would dedupe against.

## Business Rules

- `type` is one of "Expense" / "Income" / "Transfer" (capitalised). The import pipeline's lowercase internal form is converted before write. On create `type` defaults to `''` (column is NOT NULL; historic rows carry empty strings).
- `amount` is unconstrained sign at the API level; the create/edit form rejects `0` with "Amount must be non-zero".
- `tags` persists as a JSON array; reads parse it. Malformed JSON parses to `[]` (never throws).
- `entity_name` is denormalised and preserved independently of `entity_id`.
- `checksum` UNIQUE prevents duplicate CSV imports. The import pipeline pre-filters by probing existing checksums (read-only) before inserting, so duplicates are skipped rather than attempted; the `create` path itself does not map a checksum collision to a typed 409.
- Partial update only writes provided fields; an empty patch is a no-op that re-reads the row. `last_edited_time` bumps only when a field actually changes.
- Tag suggestion is purely rule-based (no LLM): correction rules → tag rules → (optional AI tags from callers) → entity-default tags, deduped in that **priority order** (first source wins). The HTTP endpoint returns just the deduped tag strings in priority order — not alphabetically sorted.
- `available-tags` is sorted; empty (`'[]'`) tag arrays are skipped.

## UI (`pillars/finance/app`)

### Transactions page (`/finance/transactions`)

- Fetches the list once and renders a `DataTable` that does **search, filtering, sorting, and pagination client-side**.
- Columns: Date (sortable, `en-AU` formatted), Description + entity-name sub-text, Account (mono), Amount (sortable, right-aligned, colour-coded), Type badge, inline Tags editor, row actions (Edit / Delete).
- Filters: account (select — ANZ Everyday, ANZ Savings, Amex, ING Savings, Up Everyday), type (Income/Expense/Transfer), tag (text contains), date range. Free-text search matches description.
- Pagination default page size 50. Loading skeleton while fetching; empty state when no rows match.
- Add/Edit via a form dialog; the amount field rejects `0` and non-numeric input.
- Delete shows a confirm dialog, then a toast with an **Undo** action that calls `restore` with the snapshot returned by `delete`.

### Inline tag editor (`components/tag-editor`)

- Tag cell opens a popover. Current tags render as removable chips with deterministic hash-based colours (`hashToColor` — same tag, same colour).
- Text input with autocomplete from `available-tags`: starts-with matches first, then contains, max 8 suggestions.
- Keyboard: Enter/comma adds the typed tag, Tab adds the first suggestion, Backspace (empty input) removes the last chip, Escape cancels.
- "Suggest" button calls `suggest-tags`, merges new suggestions into the chip set, shows a loading label; failures fall back to no change.
- Save calls `PATCH /transactions/:id` with the new tags; a toast confirms and the row reflects immediately. The same `TagEditor` component is reused by the import wizard.

### Dashboard (`/finance`, index)

- Stat cards: total transaction count, recent income, recent expenses, net balance — computed from the last 10 fetched transactions (`GET /transactions?limit=10`); transfers excluded from income/expense sums.
- Card colours are signed: positive → emerald, negative → rose, zero → slate. Zero never renders red or green.
- Recent transactions list (last 10) and active budgets section (first 3, via `GET /budgets?limit=5`). Read-only — no CRUD from the dashboard.
- Loading skeletons; error state with expandable technical detail.

## Edge Cases

| Case                              | Behaviour                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Transaction with no entity        | `entity_id`/`entity_name` null — description renders alone                             |
| Contact deleted/unknown           | `entity_name` still renders; no FK so the row is unaffected                            |
| Malformed `tags` JSON             | Parsed to `[]` on read (both wire mapper and available-tags)                           |
| Duplicate `checksum` (import)     | Pre-filtered by a read-only checksum probe before insert; the duplicate row is skipped |
| Restore onto an existing id       | 409 conflict (`TransactionAlreadyExistsError`)                                         |
| Suggest with no rule/entity match | Returns `[]` — user tags manually                                                      |

## Acceptance Criteria

- [x] `transactions` table with all columns and indexes above; `checksum` and `notion_id` unique.
- [x] `GET /transactions` paginates and filters on search/account/date-range/tag/entityId/type, ordered by date DESC.
- [x] `GET /transactions/:id` 404s when missing; `POST` generates UUID + `last_edited_time`; `PATCH` is a true partial update that bumps `last_edited_time` only on change.
- [x] `DELETE` returns a full snapshot and `POST /transactions/restore` re-inserts it preserving id/checksum/raw_row/notion_id; restore onto a live id 409s.
- [x] `GET /transactions/suggest-tags` returns priority-ordered deduped rule/entity tags with no LLM call; empty when nothing matches.
- [x] `GET /transactions/available-tags` returns distinct sorted tags; malformed tag JSON yields `[]`.
- [x] `GET /transactions/descriptions-preview` returns `{ description, checksum }[]` with `total`/`truncated`.
- [x] Transactions DataTable: client-side search, account/type/tag/date filters, Date & Amount sorting both directions, page size 50, skeleton + empty state.
- [x] Amount colour-coded (red expense / green income); form rejects `0` with "Amount must be non-zero".
- [x] Inline tag editor: removable hash-coloured chips, autocomplete (starts-with then contains, max 8), Enter/comma/Tab/Backspace/Escape keys, Suggest button, save via PATCH with toast, immediate row reflection.
- [x] Delete confirm dialog + Undo toast wired to restore.
- [x] Dashboard stat cards (count, recent income/expenses, net) with sign-based colours (zero never red/green), recent list, active budgets, read-only.

## Out of Scope

- Import pipeline, entity matching, deduplication (separate PRDs).
- Corrections engine and type-only correction classification (corrections PRD).
- Budget aggregation (budgets PRD).
  </content>
  </invoke>
