# US-06: Common parsing utilities

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a developer, I want shared utility functions for date normalization, amount parsing, and location extraction so that all parsers use consistent transformations.

## Acceptance Criteria

- [x] `normaliseDate(dateStr)`: DD/MM/YYYY → YYYY-MM-DD, validates format
- [x] `normaliseAmount(amountStr)`: inverts sign (positive = debit, negative = credit), throws on NaN
- [x] `extractLocation(locationStr)`: first line of multiline, title-case
- [x] Checksum generation: SHA-256 of key-sorted JSON-stringified raw row
- [x] All functions handle edge cases (empty strings, null, malformed input)
- [x] Tests for each utility with edge cases

## Notes

Shared utilities live in `apps/pops-api/src/modules/finance/imports/lib/parse-utils.ts`. All parsers import from there instead of reimplementing. Online transaction detection was dropped as a feature requirement.
