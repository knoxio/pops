# US-04: Description normalization

> PRD: [024 — Corrections](README.md)
> Status: Done

## Description

As a developer, I want descriptions normalized consistently so that pattern matching works regardless of casing, numbers, or whitespace.

## Acceptance Criteria

- [x] Normalization: uppercase, remove all digits, collapse multiple spaces to single, trim
- [x] Applied on both storage (createOrUpdate) and query (findMatch)
- [x] "McDonald's North Sydney 2060" → "MCDONALD'S NORTH SYDNEY"
- [x] "IKEA TEMPE" and "ikea tempe" produce the same normalized form
- [x] Test with various inputs: mixed case, numbers, extra whitespace, special characters

## Notes

Normalization must be identical in both directions — if a pattern was stored as "MCDONALD'S NORTH SYDNEY", the query for "McDonald's North Sydney 2060" must normalize to the same string.
