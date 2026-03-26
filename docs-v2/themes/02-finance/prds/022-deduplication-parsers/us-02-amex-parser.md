# US-02: Amex CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a user, I want to import Amex CSV exports so that my credit card transactions are in POPS.

## Acceptance Criteria

- [x] Parses Amex CSV format: Date, Amount, Description, Town/City columns
- [x] Date: DD/MM/YYYY → YYYY-MM-DD
- [x] Amount: parse float, invert sign (Amex shows charges as positive, should be negative)
- [x] Location: extract first line of multiline Town/City, title-case
- [x] Account set to "Amex"
- [x] Online detection via keyword heuristic
- [x] Output: valid ParsedTransaction[] with checksums
- [x] Test with sample Amex CSV data

## Notes

Amex's sign convention is opposite to most banks — charges are positive numbers. The parser must negate them.
