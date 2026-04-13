# PRD-032: Global Rule Manager & Priority Ordering

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: In progress

## Overview

Add a "Manage Rules" entry point on Step 4 (Review) that opens `CorrectionProposalDialog` in a new browse-all mode. In this mode the sidebar loads every existing rule (DB + pending from PRD-030) for full CRUD. Introduce an explicit `priority` column to the corrections table so users can control which rule wins when multiple rules match a transaction. Drag-to-reorder in the sidebar sets priority. Show override indicators when multiple rules could match, and mark orphaned entities on `/finance/entities`.

## Data Model

### `transaction_corrections` table changes

| Column     | Type      | Constraints          | Notes                          |
| ---------- | --------- | -------------------- | ------------------------------ |
| `priority` | `INTEGER` | `NOT NULL DEFAULT 0` | Lower number = higher priority |

### Migration backfill

Existing rules receive priority based on current implicit ordering:

| Match type | Priority band |
| ---------- | ------------- |
| `exact`    | 0 -- 999      |
| `contains` | 1000 -- 1999  |
| `regex`    | 2000 -- 2999  |

Within each band, rules are ordered by `confidence DESC`, `timesApplied DESC` and assigned sequential values with gaps of 10.

## API Surface

No new endpoints. Existing endpoints change:

- `core.corrections.list` — response includes `priority` field.
- `core.corrections.create` — accepts optional `priority` (defaults to 0).
- `core.corrections.update` — accepts optional `priority`.
- Matching functions (`findMatchingCorrection`, `findMatchingCorrectionFromRules`) — sort by `priority ASC` instead of the old match-type hierarchy.

## Business Rules

- Priority is explicit and user-controlled — lower number = higher priority.
- In browse mode, all rule changes go through the local pending store (PRD-030) — no immediate DB writes.
- Preview in browse mode must show impact on BOTH import transactions and existing DB transactions.
- When multiple rules match, the highest-priority (lowest number) active rule wins.
- Drag-reorder renumbers priorities with gaps (multiples of 10) so future insertions don't require renumbering all rules.
- New rules created via "Add" default to priority 0 (highest) unless explicitly placed.
- The browse-all sidebar must show both DB rules and pending (not-yet-committed) rules, visually distinguished.

## Edge Cases

| Case                                                    | Behaviour                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Zero existing rules in DB                               | Browse mode shows empty sidebar with just "Add rule" button.                                                    |
| User reorders then cancels dialog                       | Pending priority changes are discarded.                                                                         |
| Two rules at the same priority                          | Tie-break by `id` (stable sort).                                                                                |
| User disables the winning rule                          | Next-priority rule now wins; preview updates.                                                                   |
| Orphaned entity check with only "skipped" transactions  | Entity still counts as having transactions — not orphaned.                                                      |
| Existing DB transactions count for preview exceeds 2000 | Client caps at 2000, shows "preview truncated" hint (reuses existing `PREVIEW_CHANGESET_MAX_TRANSACTIONS` cap). |

## User Stories

| #   | Story                                                                           | Summary                                                   | Status      | Parallelisable                            |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------- | ----------------------------------------- |
| 01  | [us-01-priority-column-migration](us-01-priority-column-migration.md)           | Add `priority` column, backfill, update types and schemas | Done        | Yes                                       |
| 02  | [us-02-priority-aware-matching](us-02-priority-aware-matching.md)               | Update matching algorithm to sort by priority ASC         | Done        | Blocked by us-01                          |
| 03  | [us-03-browse-all-mode](us-03-browse-all-mode.md)                               | Browse-all mode for CorrectionProposalDialog              | Done        | Blocked by PRD-030 us-03                  |
| 04  | [us-04-manage-rules-button](us-04-manage-rules-button.md)                       | "Manage Rules" button in ReviewStep                       | Done        | Blocked by us-03                          |
| 05  | [us-05-drag-to-reorder](us-05-drag-to-reorder.md)                               | Drag-to-reorder priority in browse-mode sidebar           | Done        | Blocked by us-01, us-03; knoxio/pops#1742 |
| 06  | [us-06-impact-preview-db-transactions](us-06-impact-preview-db-transactions.md) | Impact preview includes existing DB transactions          | Not started | Blocked by us-03; knoxio/pops#1743        |
| 07  | [us-07-override-indicators](us-07-override-indicators.md)                       | Override indicators when multiple rules match             | Done        | Blocked by us-02; knoxio/pops#1744        |
| 08  | [us-08-orphaned-entity-indicators](us-08-orphaned-entity-indicators.md)         | Orphaned entity badges on /finance/entities               | Done        | Yes                                       |

## Out of Scope

- The local-first stores and merge layer (PRD-030)
- The commit endpoint and retroactive reclassification (PRD-031)
- Tag rule management (PRD-029)
- Entity editing/creation from the rule manager (handled by existing EntityCreateDialog)
