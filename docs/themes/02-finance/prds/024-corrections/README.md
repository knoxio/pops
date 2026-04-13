# PRD-024: Corrections (Classification Rules)

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: Partial

## Overview

Build a corrections system that stores learned **classification rules** for bank transactions. These rules express user intent and improve matching over time.

Classification rules can:

- assign an entity (merchant/payee) when applicable
- classify a transaction’s type (purchase / transfer / income)
- apply a location override when needed

Rules are learned through an explicit proposal flow (PRD-028): rule changes are always proposed, previewed, and approved by the user.

Tag rule learning is specified separately (PRD-029) and must not be coupled to classification rules.

**Open gap:** `v_active_corrections` view ordering in SQL may not match **priority-first** runtime matching (PRD-032). Tracked in GitHub knoxio/pops#1745.

## Data Model

### transaction_corrections

| Column              | Type    | Constraints | Description                                       |
| ------------------- | ------- | ----------- | ------------------------------------------------- |
| id                  | TEXT    | PK          | Unique rule ID                                    |
| description_pattern | TEXT    | NOT NULL    | Normalized pattern to match against               |
| match_type          | TEXT    | NOT NULL    | exact / contains / regex                          |
| entity_id           | TEXT    | nullable    | Entity to assign (optional)                       |
| entity_name         | TEXT    | nullable    | Denormalized entity name (optional)               |
| location            | TEXT    | nullable    | Location override (optional)                      |
| transaction_type    | TEXT    | nullable    | purchase / transfer / income                      |
| confidence          | REAL    | 0..1        | Reliability score used for activation             |
| times_applied       | INTEGER | >= 0        | Count of times the rule matched during processing |
| created_at          | TEXT    |             | Creation timestamp                                |
| last_used_at        | TEXT    | nullable    | Last time the rule matched                        |

### Active corrections

Only active corrections are considered during processing. “Active” is defined by a confidence threshold and ordering rules that make the best rule win deterministically.

## Matching Semantics

### Normalization

Patterns and descriptions must be normalized consistently so that:

- merchant suffix numbers do not create accidental fragmentation
- whitespace differences do not create false misses
- casing does not matter

### Match types

- **exact**: normalized description equals normalized pattern
- **contains**: normalized pattern is a substring of normalized description
- **regex**: normalized description matches a stored regex pattern (when enabled)

### Priority

When multiple rules match:

- choose highest confidence
- break ties deterministically (e.g. most applied, then most recently used)

## Transfer-only support (required)

Rules must be able to classify a transaction as **transfer** (or income) without requiring an entity assignment.

Examples:

- PayID transfers that should be treated as transfer regardless of counterparty label
- “SAVINGS TRANSFER” patterns that should be classified as transfer across accounts

## API Surface

The corrections system must support:

- listing and retrieving rules
- matching rules against a description
- applying usage tracking when a rule matches during processing
- create/update/delete operations, invoked only through an approved ChangeSet (PRD-028)

Additionally, the API exposes ChangeSet tooling for rule evolution:

- `core.corrections.proposeChangeSet` — generate a bundled ChangeSet proposal from a correction signal, including rationale and a bounded impact preview (counts + affected list)
- `core.corrections.previewChangeSet` — deterministic impact preview for a proposed ChangeSet against a set of transaction descriptions
- `core.corrections.applyChangeSet` — apply a ChangeSet atomically

## Confidence and activation

The system must define how confidence affects activation and matching:

- what confidence threshold counts as “active”
- how confidence changes over time (if at all)
- how a user correction can reduce confidence or disable a rule (via ChangeSet proposals)

These semantics must be consistent with the import pipeline and visible to the user at proposal time.

## Usage semantics (required)

The system must distinguish between:

- **rule applied**: a rule matched during processing or re-evaluation
- **rule updated**: a rule was edited by an approved ChangeSet

`times_applied` counts rule applications, not rule edits.

## Edge Cases

| Case                     | Behaviour                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Rule applies incorrectly | User edits the rule-matched transaction → proposal suggests edits/disable/remove with preview (PRD-028) |
| Two rules overlap        | Deterministic priority rules decide winner; proposal engine can suggest narrowing/removal               |
| Entity deleted           | Rule may remain as a type-only classifier or be proposed for cleanup                                    |

## User Stories

| #   | Story                                         | Summary                                                 | Status    | Parallelisable   |
| --- | --------------------------------------------- | ------------------------------------------------------- | --------- | ---------------- |
| 01  | [us-01-schema-api](us-01-schema-api.md)       | Corrections storage and matching primitives             | Done   | No (first)       |
| 02  | [us-02-upsert-logic](us-02-upsert-logic.md)   | Rule create/update semantics consistent with ChangeSets | Done   | Blocked by us-01 |
| 03  | [us-03-auto-cleanup](us-03-auto-cleanup.md)   | Rule lifecycle management (deactivation / removal)      | Done   | Blocked by us-01 |
| 04  | [us-04-normalization](us-04-normalization.md) | Normalization contract for storage and matching         | Done   | Blocked by us-01 |

## Verification

- A “Woolworths” rule matches multiple Woolworths variants that differ by suffix numbers within the same import after approval.
- A PayID transfer rule classifies later PayID rows as transfer without requiring an entity.
- `times_applied` increases only when rules match during processing or re-evaluation.

## Out of Scope

- Tag rule learning (PRD-029)
- A standalone rules management UI outside the import flow
