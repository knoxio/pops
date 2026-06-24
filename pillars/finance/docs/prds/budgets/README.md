# Budgets

> Status: Done — spend aggregation (spent / remaining, MTD/YTD windows) is built and surfaced in the UI. Dashboard cards show targets only (no per-card spend bar) and there are no alerts/forecasting — see [ideas/budget-insights.md](../../ideas/budget-insights.md).

Spending targets per category, with optional Monthly / Yearly / one-time period. Each budget is enriched at read time with actual `spent` (outflow aggregated from transactions tagged with the category) and `remaining` (`amount − spent`), so the list shows progress against target without a separate computation step.

## Data Model

`budgets` (finance SQLite, drizzle):

| Column             | Type    | Notes                                                          |
| ------------------ | ------- | -------------------------------------------------------------- |
| id                 | TEXT PK | UUID, `crypto.randomUUID()`                                    |
| category           | TEXT    | NOT NULL — matched against transaction tag values for spend    |
| period             | TEXT    | nullable: `'Monthly'`, `'Yearly'`, or NULL (one-time/all-time) |
| amount             | REAL    | nullable target limit (NULL = budget with no limit)            |
| active             | INTEGER | 0/1, default 0; projected to boolean at the API edge           |
| notes              | TEXT    | nullable                                                       |
| last_edited_time   | TEXT    | ISO 8601                                                       |
| notion_id          | TEXT    | nullable unique (import/sync provenance)                       |
| owner_uri          | TEXT    | nullable cross-pillar owner, indexed                           |
| owner_uri_stale_at | TEXT    | nullable                                                       |

Uniqueness: `idx_budgets_category_period` is a UNIQUE index on `(category, COALESCE(period, char(0)))`. SQLite treats `NULL != NULL` in plain UNIQUE constraints, so the `char(0)` sentinel forces NULL periods to collide — two one-time "Groceries" budgets conflict. `char(0)` cannot appear in user text, so no real period value can collide with the sentinel.

- [x] Schema, nullable period, and the COALESCE-sentinel unique index exist as described; service create/update pre-check uses `isNull()` for the NULL-period branch.

## REST API Surface

Mounted under the finance contract as `budgets.*` (ts-rest + zod, OpenAPI projected). Read responses carry `spent` and `remaining`.

| Method & Path         | Body / Query                                                            | Result                                                    |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `GET /budgets`        | `search?`, `period?`, `active?` (`'true'`/`'false'`), `limit`, `offset` | `{ data: Budget[], pagination }`, ordered by category ASC |
| `GET /budgets/:id`    | —                                                                       | `{ data: Budget }`, 404 if missing                        |
| `POST /budgets`       | `category`, `period?`, `amount?`, `active?` (default false), `notes?`   | 201 `{ data, message }`                                   |
| `PATCH /budgets/:id`  | partial of the create body                                              | 200 `{ data, message }`                                   |
| `DELETE /budgets/:id` | —                                                                       | 200 `{ message }`, 404 if missing                         |

`Budget` wire shape: `id, category, period (string|null), amount (number|null), active (boolean), notes (string|null), lastEditedTime, spent (number ≥ 0), remaining (number|null)`.

- [x] All five endpoints implemented; `active` integer↔boolean projection in `toBudget`; create defaults `active` to false at both contract and service layers.
- [x] Duplicate `(category, period)` → 409 with a descriptive message (friendly pre-check fast path plus a unique-violation safety net on INSERT/UPDATE for races); unknown id → 404; empty category → 400.
- [x] Budgets are searchable via the cross-pillar search endpoint (category `LIKE`, `uri: /budgets/:id`).

## Spend Aggregation

`bulkComputeSpend` runs one `SELECT … GROUP BY tag` per distinct period (not per row), joining `transactions` with `json_each(tags)` and matching the tag value against budget categories. This is the single source of spend semantics for both the list path and the single-row `withSpend` wrapper used by get/create/update.

Rules:

- Outflow only: sums `-amount` where `amount < 0`; income (positive amounts) contributes zero.
- Excludes `type = 'Transfer'` transactions.
- Period window (`period-window.ts`): Monthly = first day of current month → today (MTD); Yearly = Jan 1 → today (YTD); NULL period = all-time (no lower bound). Upper bound always clamps to today, so future-dated transactions never count. Windows compare lexicographically against the `YYYY-MM-DD` `transactions.date` text column.
- `remaining = amount − spent`, or `null` when `amount` is null.

This consumes the tag mechanism directly: there is no online/in-person or any other special field on a transaction — a budget tracks whatever tag value equals its category, and tags (including online-vs-in-person) are produced by `transaction_tag_rules`. One model, one mechanism.

- [x] Spend aggregation, transfer exclusion, income exclusion, and MTD/YTD windows are implemented and unit-tested; `now` is injectable for deterministic window tests.

## App (pillars/finance/app)

- [x] Budgets page: `DataTable` with columns Category (sortable), Period (One-time / Monthly / Yearly badge), Amount (right-aligned, `—` when null), **Spent** (badge, destructive when over budget), **% Progress** (Progress bar capped at 100% with numeric percent, destructive past 100%, `—` when no/zero amount), Status (Active/Inactive badge), Notes (truncated). Searchable by category; select filters for Period (incl. One-time via `__null__`) and Status; pagination, loading skeleton, error panel.
- [x] Create/edit/delete: "Add Budget" opens a React Hook Form + Zod dialog (category required, period select with One-time→`''`→null mapping, amount optional number, active checkbox, notes textarea); row actions edit (pre-filled) and delete (confirmation dialog); toast on success; list invalidated after each mutation; duplicate surfaces the 409 message as a toast.
- [x] Dashboard `ActiveBudgets`: cards for up to 3 active budgets showing amount and period, with an empty state linking to the budgets page.

## Edge Cases

- One-time budgets (NULL period) aggregate spend all-time and collide on duplicate `(category, NULL)`.
- Budgets with `amount = null` exist as trackers: `remaining` and `% Progress` render as `—`.
- A category with no matching tagged transactions reports `spent = 0`, `remaining = amount`.
- Over-budget rows surface via a destructive Spent badge and a >100% progress percentage; the bar itself stays visually capped at 100%.
