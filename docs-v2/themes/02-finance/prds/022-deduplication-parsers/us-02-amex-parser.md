# US-02: Amex CSV parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: To Review

## Description

As a user, I want to import Amex CSV exports so that my credit card transactions are in POPS.

## Acceptance Criteria

- [ ] Parses Amex CSV format: Date, Amount, Description, Town/City columns
- [ ] Date: DD/MM/YYYY → YYYY-MM-DD
- [ ] Amount: parse float, invert sign (Amex shows charges as positive, should be negative)
- [ ] Location: extract first line of multiline Town/City, title-case
- [ ] Account set to "Amex"
- [ ] Online detection via keyword heuristic
- [ ] Output: valid ParsedTransaction[] with checksums
- [ ] Test with sample Amex CSV data

## Notes

Amex's sign convention is opposite to most banks — charges are positive numbers. The parser must negate them.
