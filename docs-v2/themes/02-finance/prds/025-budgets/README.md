# PRD-025: Budgets

> Epic: [04 — Budgets](../../epics/04-budgets.md)
> Status: Partial

## Overview

Build budget tracking — spending categories with monthly or yearly limits. Shows actual spend against target with active/inactive toggle.

## Data Model

### budgets

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | |
| category | TEXT | NOT NULL | Budget category name |
| period | TEXT | nullable | "monthly", "yearly", or null (one-time) |
| amount | REAL | nullable | Budget limit (null = no limit) |
| active | INTEGER | DEFAULT 1 | 0/1 boolean |
| notes | TEXT | nullable | |
| last_edited_time | TEXT | NOT NULL | ISO 8601 |

**Constraint:** UNIQUE on (category, period) — including null period matching null.

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `finance.budgets.list` | search?, period?, active?, limit, offset | `{ data, pagination }` | Ordered by category ASC |
| `finance.budgets.get` | id | `{ data }` | 404 if not found |
| `finance.budgets.create` | category, period?, amount?, active?, notes? | `{ data }` | Unique (category, period) enforced. Active defaults to false (0) |
| `finance.budgets.update` | id, data (partial) | `{ data }` | |
| `finance.budgets.delete` | id | `{ message }` | |

## Business Rules

- Unique (category, period) — null period matches other null periods
- Duplicate → 409 CONFLICT with descriptive message
- Active stored as integer 0/1, API converts to boolean
- Amount can be null (budget exists without a limit)
- Active defaults to false on create

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-schema-api](us-01-schema-api.md) | Budget table, unique constraint, CRUD procedures | Partial | No (first) |
| 02 | [us-02-budgets-page](us-02-budgets-page.md) | DataTable with search, period/status filters, sorting | Done | Blocked by us-01 |
| 03 | [us-03-budget-crud-ui](us-03-budget-crud-ui.md) | Create/edit/delete dialogs with form validation | Done | Blocked by us-01 |

## Out of Scope

- Spend vs target calculation (requires transaction aggregation by tag/category — future enhancement)
- Budget alerts or notifications
- Forecasting
