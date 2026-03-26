# PRD-026: Wishlist

> Epic: [05 — Wishlist](../../epics/05-wishlist.md)
> Status: Done

## Overview

Build the wishlist — savings goals with target amounts, progress tracking, and priority levels. Users add items they want to buy, set a target price, track how much they've saved, and see progress.

## Data Model

### wish_list

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | |
| item | TEXT | NOT NULL | Item description |
| target_amount | REAL | nullable | Total cost target |
| saved | REAL | nullable | Amount saved so far |
| priority | TEXT | nullable | Enum: "Needing", "Soon", "One Day", "Dreaming" |
| url | TEXT | nullable | Link to item (URL validated) |
| notes | TEXT | nullable | |
| last_edited_time | TEXT | NOT NULL | ISO 8601 |

**Computed:** `remainingAmount = targetAmount - saved` (null if either is null)

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `finance.wishlist.list` | search?, priority?, limit, offset | `{ data, pagination }` | Ordered by item ASC. Includes computed remainingAmount |
| `finance.wishlist.get` | id | `{ data }` | |
| `finance.wishlist.create` | item, targetAmount?, saved?, priority?, url?, notes? | `{ data }` | URL validated if provided |
| `finance.wishlist.update` | id, data (partial) | `{ data }` | |
| `finance.wishlist.delete` | id | `{ message }` | |

## Business Rules

- Remaining = target - saved (null if either is null — no implicit zero)
- URL must be valid if provided
- Priority is an enum with 4 levels: Needing, Soon, One Day, Dreaming
- Progress percentage: `(saved / target) * 100` (displayed in UI, not stored)

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-schema-api](us-01-schema-api.md) | Wishlist table, CRUD procedures, URL validation, remaining calculation ✅ | No (first) |
| 02 | [us-02-wishlist-page](us-02-wishlist-page.md) | DataTable with progress bars, priority badges, external links ✅ | Blocked by us-01 |
| 03 | [us-03-wishlist-crud-ui](us-03-wishlist-crud-ui.md) | Create/edit/delete dialogs with form validation ✅ | Blocked by us-02 |

## Out of Scope

- Price tracking or alerts
- Integration with inventory (linking purchased items)
- Automatic "saved" updates from transactions
