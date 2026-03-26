# US-04: ING CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Not started

## Description

As a user, I want to import ING CSV exports so that my savings transactions are in POPS.

## Acceptance Criteria

- [ ] Parses ING CSV format with Credit/Debit columns
- [ ] Date: DD/MM/YYYY → YYYY-MM-DD
- [ ] Amount: parse Credit/Debit, negate debits
- [ ] Description: clean whitespace
- [ ] Account: "ING Savings"
- [ ] Output: valid ParsedTransaction[] with checksums
- [ ] Test with sample ING CSV data

## Notes

ING separates credits and debits into separate columns. Parser must combine them into a single signed amount.
