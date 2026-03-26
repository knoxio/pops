# PRD-023: Entities

> Epic: [02 — Entities](../../epics/02-entities.md)
> Status: To Review

## Overview

Build the entity registry — the merchant/payee database that transactions and other domains reference. Entities are a platform-level concept (per ADR-005) living in the `core/` module. Full CRUD, aliases, default tags, and type classification.

## Data Model

### entities

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | `crypto.randomUUID()` |
| name | TEXT | NOT NULL, unique (case-sensitive) | Entity display name |
| type | TEXT | NOT NULL, DEFAULT 'company' | "company", "person", "government", "bank" |
| abn | TEXT | nullable | Australian Business Number |
| aliases | TEXT | nullable | Comma-separated alternate names for matching |
| default_transaction_type | TEXT | nullable | Suggested type when matched (purchase/transfer/income) |
| default_tags | TEXT | DEFAULT '[]' | JSON array of tags to apply by default |
| notes | TEXT | nullable | Free-form notes |
| last_edited_time | TEXT | NOT NULL | ISO 8601 |

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `core.entities.list` | search?, type?, limit (50), offset (0) | `{ data: Entity[], pagination }` | Ordered by name ASC. Converts aliases string→array, default_tags JSON→array |
| `core.entities.get` | id | `{ data: Entity }` | 404 if not found |
| `core.entities.create` | name, type?, abn?, aliases (array)?, defaultTransactionType?, defaultTags (array)?, notes? | `{ data: Entity }` | Unique name enforced. Aliases array→comma string. Tags array→JSON |
| `core.entities.update` | id, data (partial) | `{ data: Entity }` | Partial update |
| `core.entities.delete` | id | `{ message }` | FK SET NULL on related transactions |

## Business Rules

- Entity name must be unique (case-sensitive enforcement in service layer)
- Aliases stored as comma-separated string; API accepts/returns arrays
- Default tags stored as JSON array; API accepts/returns arrays
- Deletion doesn't cascade — transactions retain `entity_name` (denormalized) but `entity_id` becomes null
- Type defaults to "company" if not provided
- Entities are shared across all domains (finance, inventory, etc.)

## UI: Entities Page

- DataTable with columns: Name (sortable), Type badge, ABN (monospace), Aliases (badges with +N overflow), Default Type badge, Default Tags (badges)
- Search by name
- Filter by type
- Read-only in current implementation (CRUD via import pipeline and API)

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Duplicate entity name | Create returns 409 CONFLICT |
| Entity with aliases containing only whitespace | Whitespace-only aliases stripped during parsing |
| Entity deleted while import is running | Import uses cached entity lookup — deletion won't affect in-flight imports |
| Entity referenced by inventory item | `entity_id` on inventory item becomes null (FK SET NULL) |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-schema-api](us-01-schema-api.md) | Entity table, CRUD procedures, alias/tag serialization | No (first) |
| 02 | [us-02-entities-page](us-02-entities-page.md) | DataTable with search, type filter, alias/tag display | Blocked by us-01 |
| 03 | [us-03-entity-crud-ui](us-03-entity-crud-ui.md) | Create/edit/delete dialogs on the entities page | Done |

## Verification

- CRUD works for all fields including aliases and default tags
- Duplicate name prevention works
- Alias serialization: array↔comma-separated roundtrips correctly
- Entity deletion leaves transactions with entity_name intact
- DataTable filters and sorts correctly

## Out of Scope

- Entity matching logic (PRD-021)
- Cross-domain entity usage beyond finance (future domains will reference the same entity table)
