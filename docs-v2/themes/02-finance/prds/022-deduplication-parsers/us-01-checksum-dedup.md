# US-01: Checksum-based deduplication

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a developer, I want checksum-based deduplication so that re-importing the same CSV doesn't create duplicate transactions.

## Acceptance Criteria

- [x] Each ParsedTransaction has a SHA-256 checksum of its raw CSV row (JSON stringified)
- [x] Batch query: `SELECT checksum FROM transactions WHERE checksum IN (?)`, batched in groups of 500
- [x] Matching checksums → transaction marked as "skipped" with reason "Duplicate transaction (checksum match)"
- [x] New checksums → transaction proceeds to entity matching
- [x] `transactions.checksum` column has UNIQUE constraint
- [x] Test: importing same CSV twice → second import skips all rows

## Notes

Batching at 500 is necessary because SQLite has a limit on the number of variables in a single query. The checksum is generated client-side (Step 2) and verified server-side (Step 3).
