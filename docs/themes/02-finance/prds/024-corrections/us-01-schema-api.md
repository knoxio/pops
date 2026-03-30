# US-01: Corrections schema and API

> PRD: [024 — Corrections](README.md)
> Status: Done

## Description

As a developer, I want the corrections table, active view, and CRUD API so that learned rules can be stored and queried.

## Acceptance Criteria

- [x] `transaction_corrections` table with all columns, CHECK constraint on confidence (0-1)
- [x] Indexes on description_pattern, confidence, times_applied
- [x] `v_active_corrections` view: confidence >= 0.7, ordered by confidence DESC, times_applied DESC
- [x] CRUD procedures: list (minConfidence filter), get, createOrUpdate, update, delete
- [x] `findMatch` procedure: normalizes input, tries exact then contains, returns best match or null
- [x] `adjustConfidence` procedure: clamps [0,1], auto-deletes below 0.3
- [x] Tests cover CRUD, findMatch priority, confidence clamping, auto-delete

## Notes

The corrections module lives in `core/` — it's used by the import pipeline (finance) but will extend to other domains.
