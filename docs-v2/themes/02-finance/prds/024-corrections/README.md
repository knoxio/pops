# PRD-024: Corrections

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: To Review

## Overview

Build the corrections system — learned tagging rules that improve over time. When a user corrects a transaction's entity or tags during import, the system stores the pattern and applies it automatically to future matches. Supports exact and contains pattern matching with confidence scoring and auto-cleanup.

## Data Model

### transaction_corrections

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | |
| description_pattern | TEXT | NOT NULL | Normalized pattern to match against |
| match_type | TEXT | DEFAULT 'exact' | "exact", "contains", "regex" |
| entity_id | TEXT | FK → entities(id) ON DELETE SET NULL | Linked entity |
| entity_name | TEXT | nullable | Denormalized entity name |
| location | TEXT | nullable | Location override |
| tags | TEXT | DEFAULT '[]' | JSON array of tags |
| transaction_type | TEXT | nullable | "purchase", "transfer", "income" |
| confidence | REAL | DEFAULT 0.5, CHECK 0-1 | Reliability score |
| times_applied | INTEGER | DEFAULT 0 | Usage counter |
| created_at | TEXT | auto | Creation timestamp |
| last_used_at | TEXT | nullable | Last time this rule matched |

**Indexes:** description_pattern, confidence, times_applied
**View:** `v_active_corrections` — WHERE confidence >= 0.7, ORDER BY confidence DESC, times_applied DESC

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `core.corrections.list` | minConfidence?, limit, offset | `{ data, pagination }` | Ordered by confidence DESC, times_applied DESC |
| `core.corrections.get` | id | `{ data }` | 404 if not found |
| `core.corrections.findMatch` | description, minConfidence (0.7) | `{ data: Correction \| null }` | Normalizes description, tries exact then contains, returns best match |
| `core.corrections.createOrUpdate` | descriptionPattern, matchType?, entityId?, entityName?, location?, tags?, transactionType?, confidence? | `{ data }` | **Upsert:** existing pattern → increment confidence by 0.1, increment times_applied, merge fields. New → create with confidence 0.5 |
| `core.corrections.update` | id, data (partial) | `{ data }` | Direct update |
| `core.corrections.delete` | id | `{ message }` | |
| `core.corrections.adjustConfidence` | id, delta (-1 to 1) | `{ message }` | Clamps to [0,1]. **Auto-deletes if confidence drops below 0.3** |

## Business Rules

- **Normalization:** description_pattern stored normalized (uppercase, numbers removed, whitespace normalized)
- **findMatch priority:** exact match first → contains match second → highest confidence wins → ties broken by times_applied
- **Upsert on reuse:** same pattern + matchType → confidence +0.1 (capped at 1.0), times_applied +1, last_used_at updated, fields merged
- **Auto-cleanup:** if adjustConfidence pushes below 0.3, the correction is deleted (low-confidence rules are noise)
- **Active view:** only corrections with confidence >= 0.7 are used during import matching
- **Tags stored as JSON array**

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Pattern already exists (upsert) | Confidence incremented, times_applied incremented, fields merged |
| Confidence adjusted below 0.3 | Correction auto-deleted |
| Confidence at 1.0, incremented again | Capped at 1.0 |
| Entity deleted | entity_id set null, entity_name preserved |
| Regex match_type | Defined in schema but not yet implemented in findMatch |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-schema-api](us-01-schema-api.md) | Corrections table, view, CRUD + findMatch + adjustConfidence procedures | No (first) |
| 02 | [us-02-upsert-logic](us-02-upsert-logic.md) | createOrUpdate upsert: confidence increment, times_applied tracking, field merging | Blocked by us-01 |
| 03 | [us-03-auto-cleanup](us-03-auto-cleanup.md) | adjustConfidence with auto-delete below 0.3 threshold | Blocked by us-01 |
| 04 | [us-04-normalization](us-04-normalization.md) | Description normalization for storage and matching (uppercase, strip numbers, normalize whitespace) | Blocked by us-01 |

US-02, US-03, US-04 can parallelise after US-01.

## Verification

- findMatch returns best correction for a given description
- Upsert increments confidence and times_applied on reuse
- Auto-delete fires when confidence drops below 0.3
- Active view only returns corrections with confidence >= 0.7
- Normalization produces consistent patterns

## Out of Scope

- Corrections management UI (future enhancement — currently managed via import "Save & Learn")
- Regex matching implementation (schema supports it, logic deferred)
- AI rule generation (PRD-027)
