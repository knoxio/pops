# PRD-019: Transactions

> Epic: [00 — Transactions](../../epics/00-transactions.md)
> Status: Done

## Overview

Build the transaction ledger — the core of the finance app. Every financial transaction across all bank accounts lives here. Full CRUD, filtering, sorting, inline tag editing, and a dashboard with summary stats.

## Data Model

### transactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | `crypto.randomUUID()` |
| description | TEXT | NOT NULL | Raw merchant/payee description from bank |
| account | TEXT | NOT NULL | Account identifier (e.g., "ANZ Everyday", "Amex") |
| amount | REAL | NOT NULL | Transaction amount. Negative = expense, positive = income |
| date | TEXT | NOT NULL | YYYY-MM-DD format |
| type | TEXT | NOT NULL | "purchase", "transfer", or "income" |
| tags | TEXT | DEFAULT '[]' | JSON array of tag strings |
| entity_id | TEXT | FK → entities(id), nullable | Linked entity |
| entity_name | TEXT | nullable | Denormalized entity name (survives entity deletion) |
| location | TEXT | nullable | Geographic location |
| country | TEXT | nullable | Country code |
| related_transaction_id | TEXT | nullable | Links paired transfers |
| notes | TEXT | nullable | User annotations |
| checksum | TEXT | UNIQUE | SHA-256 hash of raw CSV row for deduplication |
| raw_row | TEXT | nullable | Full CSV row as JSON (audit trail) |
| last_edited_time | TEXT | NOT NULL | ISO 8601 timestamp |

**Indexes:** date, account, entity_id, last_edited_time, checksum (unique)

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `finance.transactions.list` | search?, account?, startDate?, endDate?, tag?, entityId?, type?, limit (50), offset (0) | `{ data: Transaction[], pagination }` | Ordered by date DESC |
| `finance.transactions.get` | id | `{ data: Transaction }` | 404 if not found |
| `finance.transactions.create` | description, account, amount, date, type, tags?, entityId?, entityName?, location?, country?, notes?, rawRow?, checksum? | `{ data: Transaction }` | Generates UUID, sets last_edited_time |
| `finance.transactions.update` | id, data (partial) | `{ data: Transaction }` | Partial update — only provided fields change |
| `finance.transactions.delete` | id | `{ message }` | 404 if not found |
| `finance.transactions.suggestTags` | description, entityId? | `{ tags: string[] }` | Rule-based: corrections → entity defaults. Deduplicated, sorted |
| `finance.transactions.availableTags` | (none) | `string[]` | All distinct tags across all transactions |

## Business Rules

- `type` must be one of: "purchase", "transfer", "income"
- `amount` can be positive (income) or negative (expense) — no sign convention enforcement at the API level
- `tags` stored as JSON array; API parses and validates
- `entity_name` is denormalized — survives entity deletion. If entity is deleted, `entity_id` becomes null but `entity_name` remains
- `checksum` uniqueness prevents duplicate imports from the same CSV
- Partial updates only change provided fields; `last_edited_time` updates on any change
- Tag suggestion is purely rule-based (no LLM call) — uses corrections and entity defaults

## UI Pages

### Dashboard
- Stats cards: total transaction count, recent income/expenses (last 10), net balance
- Recent transactions list (last 10)
- Active budgets (first 3)
- Read-only — no CRUD from dashboard

### Transactions Page
- DataTable with columns: Date (sortable), Description + Entity (sub-text), Account, Amount (sortable, colour-coded red/green), Type badge, Tags (inline editor)
- Filters: search (description), account (select), type (select), tags (text)
- Pagination: 25/50/100 per page
- Inline tag editing via TagEditor popover with autocomplete and AI suggestions

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Transaction with no entity | `entity_id` null, `entity_name` null — displays description only |
| Entity deleted | `entity_id` set null (FK SET NULL), `entity_name` preserved |
| Malformed tags JSON | Parsed gracefully — falls back to empty array |
| Duplicate checksum on create | Insert fails with unique constraint error |
| Tag suggestion with no corrections/entity | Returns empty array — user enters tags manually |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-schema-api](us-01-schema-api.md) | Transaction table, indexes, CRUD procedures, tag suggestion | Done | No (first) |
| 02 | [us-02-transactions-page](us-02-transactions-page.md) | DataTable with filters, sorting, pagination | Done | Blocked by us-01 |
| 03 | [us-03-tag-editor](us-03-tag-editor.md) | Inline tag editing with popover, autocomplete, source badges | Done | Blocked by us-01 |
| 04 | [us-04-dashboard](us-04-dashboard.md) | Dashboard with stats cards and recent transactions | Done | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01. US-04 can parallelise with US-02.

## Verification

- CRUD operations work for all fields
- Filtering by search, account, type, tag, date range, entity all work correctly
- Sorting by date and amount works in both directions
- Inline tag editing saves and reflects immediately
- Tag suggestions return results from corrections and entity defaults
- Checksum uniqueness prevents duplicate rows
- Dashboard stats are accurate

## Out of Scope

- Import pipeline (PRD-020-022)
- Entity management (PRD-023)
- Budget aggregation (PRD-025)
