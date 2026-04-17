# US-03: ANZ CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a user, I want to import ANZ CSV exports so that my everyday/savings transactions are in POPS.

## Acceptance Criteria

- [x] Parses ANZ CSV format
- [x] Date: DD/MM/YYYY → YYYY-MM-DD
- [x] Amount: parse float (ANZ uses correct sign — expenses negative, income positive)
- [x] Description: clean whitespace
- [x] Account: "ANZ Everyday" or "ANZ Savings" (from CSV or user selection)
- [x] Output: valid ParsedTransaction[] with checksums
- [x] Test with sample ANZ CSV data

## Notes

ANZ has correct sign convention — no inversion needed unlike Amex.
