# US-04: ING CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a user, I want to import ING CSV exports so that my savings transactions are in POPS.

## Acceptance Criteria

- [x] Parses ING CSV format with Credit/Debit columns
- [x] Date: DD/MM/YYYY → YYYY-MM-DD
- [x] Amount: parse Credit/Debit, negate debits
- [x] Description: clean whitespace
- [x] Account: "ING Savings"
- [x] Output: valid ParsedTransaction[] with checksums
- [x] Test with sample ING CSV data

## Notes

ING separates credits and debits into separate columns. Parser must combine them into a single signed amount.
