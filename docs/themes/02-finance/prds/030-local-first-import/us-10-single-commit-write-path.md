# US-10: Single commit write path through the import wizard

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Done

## Description

As a user, I want the import wizard to buffer work locally and perform **one atomic database commit** on Final Review, so pending entities, classification rules, and transactions stay consistent and checksum deduplication cannot conflict.

## Acceptance Criteria

- [x] `TagReviewStep` does **not** call `finance.imports.executeImport` (no transaction writes before Step 6).
- [x] Tag Review advances to Final Review with tags persisted only in wizard state (`confirmedTransactions` / store).
- [x] `finance.imports.commitImport` on Step 6 is the **only** path that inserts imported rows for this flow (together with pending entities and ChangeSets per PRD-031).
- [x] Automated tests cover the full step sequence through commit without the legacy execute path.

## Notes

- Shipped in knoxio/pops#1757.
