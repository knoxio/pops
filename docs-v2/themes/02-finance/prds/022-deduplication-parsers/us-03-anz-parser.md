# US-03: ANZ CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Not started

## Description

As a user, I want to import ANZ CSV exports so that my everyday/savings transactions are in POPS.

## Acceptance Criteria

- [ ] Parses ANZ CSV format
- [ ] Date: DD/MM/YYYY → YYYY-MM-DD
- [ ] Amount: parse float (ANZ uses correct sign — expenses negative, income positive)
- [ ] Description: clean whitespace
- [ ] Account: "ANZ Everyday" or "ANZ Savings" (from CSV or user selection)
- [ ] Output: valid ParsedTransaction[] with checksums
- [ ] Test with sample ANZ CSV data

## Notes

ANZ has correct sign convention — no inversion needed unlike Amex.
