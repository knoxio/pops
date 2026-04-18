# PRD-022: Deduplication & Parsers

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: Done

## Overview

Build the deduplication system and per-bank CSV parsers that prepare transactions for the matching engine. Dedup prevents re-importing the same CSV. Parsers normalize each bank's unique CSV format into a common `ParsedTransaction` shape.

## Deduplication

### Mechanism

SHA-256 checksum of the entire raw CSV row (JSON stringified). Deterministic — same row always produces the same hash.

### Process

1. Extract checksums from all parsed transactions
2. Batch query SQLite: `SELECT checksum FROM transactions WHERE checksum IN (?)`
3. Batches in groups of 500 (SQLite variable limit)
4. Duplicates → skipped (reason: "Duplicate transaction (checksum match)")
5. New → proceed to entity matching

### Why Checksums Work

- Bank CSV rows are deterministic (same transaction = identical row)
- Re-importing same file → same checksums → all skipped
- No date/amount ambiguity (hash includes all fields)

## Per-Bank Parsers

Each bank has a different CSV format. A parser (transformer) normalizes to `ParsedTransaction`:

### Amex

| CSV Column  | Mapping     | Transformation                                                  |
| ----------- | ----------- | --------------------------------------------------------------- |
| Date        | date        | DD/MM/YYYY → YYYY-MM-DD                                         |
| Amount      | amount      | Parse float, invert sign (charges positive → expenses negative) |
| Description | description | Clean whitespace                                                |
| Town/City   | location    | First line of multiline, title-case                             |

Account: "Amex" (hardcoded)

### ANZ CSV

| CSV Column  | Mapping     | Transformation                         |
| ----------- | ----------- | -------------------------------------- |
| Date        | date        | DD/MM/YYYY → YYYY-MM-DD                |
| Amount      | amount      | Parse float (already signed correctly) |
| Description | description | Clean whitespace                       |

Account: "ANZ Everyday" or "ANZ Savings" (from CSV or user selection)

### ANZ PDF (credit card statements)

| PDF Column          | Mapping     | Transformation                                               |
| ------------------- | ----------- | ------------------------------------------------------------ |
| Date of Transaction | date        | DD/MM/YYYY → YYYY-MM-DD                                      |
| Transaction Details | description | Clean whitespace                                             |
| Amount ($A)         | amount      | Parse float; invert sign (purchases negative, CR → positive) |

Account: "ANZ Frequent Flyer Black" (hardcoded per statement type)

Supplementary rows (foreign currency lines, overseas fee lines) have no Card Used value and must be skipped. Sign convention differs from the CSV format — all amounts are positive in the PDF, with `CR` marking credits.

### ING

| CSV Column   | Mapping     | Transformation          |
| ------------ | ----------- | ----------------------- |
| Date         | date        | DD/MM/YYYY → YYYY-MM-DD |
| Credit/Debit | amount      | Parse, negate debits    |
| Description  | description | Clean whitespace        |

Account: "ING Savings"

### Up Bank (API, not CSV)

Fetched via Up Bank REST API, not CSV upload. Batch import by date range.

- Transactions from API already normalized
- Account from API response
- Webhook-triggered for real-time

## Common Transformations

- `normaliseDate()`: DD/MM/YYYY → YYYY-MM-DD
- `normaliseAmount()`: strip currency symbols, parse float, handle sign conventions
- `extractLocation()`: first line of multiline, title-case

## Business Rules

- Checksum uniqueness prevents duplicate rows at the database level (UNIQUE constraint)
- Re-importing the same CSV skips all rows — idempotent
- Each parser handles one bank format — no universal parser
- Up Bank uses API (not CSV) — different ingestion path but same `ParsedTransaction` output
- Raw row preserved as JSON for audit trail and AI context

## Edge Cases

| Case                                      | Behaviour                                                             |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Bank changes CSV format                   | Parser fails gracefully — affected rows shown as errors in Step 2     |
| Manual CSV edits (amount changed)         | Different checksum — treated as new transaction                       |
| Same amount, same day, different merchant | Different raw rows → different checksums → no false dedup             |
| Up Bank webhook + batch import overlap    | Checksum dedup handles it — same transaction won't be double-inserted |

## User Stories

| #   | Story                                           | Summary                                                                     | Status | Parallelisable                  |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------- | ------ | ------------------------------- |
| 01  | [us-01-checksum-dedup](us-01-checksum-dedup.md) | Checksum-based deduplication with batch SQLite queries                      | Done   | No (first)                      |
| 02  | [us-02-amex-parser](us-02-amex-parser.md)       | Amex CSV parser: date, amount inversion, location extraction                | Done   | Yes                             |
| 03  | [us-03-anz-parser](us-03-anz-parser.md)         | ANZ CSV parser                                                              | Done   | Yes                             |
| 04  | [us-04-ing-parser](us-04-ing-parser.md)         | ING CSV parser                                                              | Done   | Yes                             |
| 05  | [us-05-up-bank-import](us-05-up-bank-import.md) | Up Bank API batch import by date range                                      | Done   | Yes                             |
| 06  | [us-06-common-utils](us-06-common-utils.md)     | Shared utilities: normaliseDate, normaliseAmount, extractLocation, checksum | Done   | No (first, parallel with us-01) |
| 07  | [us-07-anz-pdf-parser](us-07-anz-pdf-parser.md) | ANZ PDF credit card statement parser                                        | Done   | Yes                             |

US-02 through US-05 and US-07 can all parallelise (independent parsers). US-06 is shared utilities used by all parsers.

## Verification

- Re-importing same CSV skips all rows
- Each parser produces correct ParsedTransaction for its bank format
- Date normalization handles DD/MM/YYYY correctly
- Amount sign conventions correct per bank
- Batch dedup works with 500+ transactions
- Up Bank API import produces same ParsedTransaction shape as CSV parsers

## Out of Scope

- Entity matching (PRD-021)
- Import wizard UI (PRD-020)
- New bank format support (add a new parser when needed)

## Drift Check

last checked: 2026-04-19
