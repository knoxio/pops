# US-10: Single commit write path through the import wizard

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a user, I want the import wizard to buffer work locally and perform **one atomic database commit** on Final Review, so pending entities, classification rules, and transactions stay consistent and checksum deduplication cannot conflict.

## Acceptance Criteria

- [ ] `TagReviewStep` does **not** call `finance.imports.executeImport` (no transaction writes before Step 6).
- [ ] Tag Review advances to Final Review with tags persisted only in wizard state (`confirmedTransactions` / store).
- [ ] `finance.imports.commitImport` on Step 6 is the **only** path that inserts imported rows for this flow (together with pending entities and ChangeSets per PRD-031).
- [ ] Automated tests cover the full step sequence through commit without the legacy execute path.

## Notes

- Tracked in GitHub: knoxio/pops#1740
