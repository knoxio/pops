# US-06: Common parsing utilities

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Partial — extractLocation, online detection, and checksum generation not exposed as shared utilities

## Description

As a developer, I want shared utility functions for date normalization, amount parsing, and location extraction so that all parsers use consistent transformations.

## Acceptance Criteria

- [x] `normaliseDate(dateStr)`: DD/MM/YYYY → YYYY-MM-DD, validates format
- [x] `normaliseAmount(amountStr)`: strip currency symbols ($, AUD), parse float
- [ ] `extractLocation(locationStr)`: first line of multiline, title-case
- [ ] Online detection: checks for keywords (AMAZON, PAYPAL, .COM.AU, NETFLIX, etc.)
- [ ] Checksum generation: SHA-256 of JSON-stringified raw row
- [x] All functions handle edge cases (empty strings, null, malformed input)
- [x] Tests for each utility with edge cases

## Notes

These are shared by all parsers. Each parser calls these utilities rather than reimplementing the logic.
