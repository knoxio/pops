# US-06: Common parsing utilities

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: To Review

## Description

As a developer, I want shared utility functions for date normalization, amount parsing, and location extraction so that all parsers use consistent transformations.

## Acceptance Criteria

- [ ] `normaliseDate(dateStr)`: DD/MM/YYYY → YYYY-MM-DD, validates format
- [ ] `normaliseAmount(amountStr)`: strip currency symbols ($, AUD), parse float
- [ ] `extractLocation(locationStr)`: first line of multiline, title-case
- [ ] Online detection: checks for keywords (AMAZON, PAYPAL, .COM.AU, NETFLIX, etc.)
- [ ] Checksum generation: SHA-256 of JSON-stringified raw row
- [ ] All functions handle edge cases (empty strings, null, malformed input)
- [ ] Tests for each utility with edge cases

## Notes

These are shared by all parsers. Each parser calls these utilities rather than reimplementing the logic.
