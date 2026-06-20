# US-21: Advance from Tag Review (no database write)

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to finish tagging and move to Final Review so that I can confirm the full payload before anything is written to the database.

## Acceptance Criteria

- [x] Primary action on Tag Review (Step 5) advances to Final Review (Step 6) without calling `executeImport` or any other import write procedure
- [x] Per-transaction tag edits from Step 5 are persisted to the in-memory import session via `updateTransactionTags` (checksum-keyed) before advancing
- [x] Copy on Step 5 states that the database is not updated until Final Review / commit (aligned with PRD-031 single write path)
- [x] No progress polling or import-result state on Step 5 for a write operation — those belong to `commitImport` on Step 6 and the summary step

## Notes

The single SQLite write path for the wizard is **`commitImport` on Step 6** (PRD-031). Step 5 only updates local/session state; `executeImport` is not part of the Tag Review flow.

## Dependencies

- Blocked by: US-19 (per-transaction tags)
- Blocks: US-22 (summary shows `commitResult` after Step 6)
