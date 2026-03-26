# US-04: Description normalization

> PRD: [024 — Corrections](README.md)
> Status: To Review

## Description

As a developer, I want descriptions normalized consistently so that pattern matching works regardless of casing, numbers, or whitespace.

## Acceptance Criteria

- [ ] Normalization: uppercase, remove all digits, collapse multiple spaces to single, trim
- [ ] Applied on both storage (createOrUpdate) and query (findMatch)
- [ ] "McDonald's North Sydney 2060" → "MCDONALD'S NORTH SYDNEY"
- [ ] "IKEA TEMPE" and "ikea tempe" produce the same normalized form
- [ ] Test with various inputs: mixed case, numbers, extra whitespace, special characters

## Notes

Normalization must be identical in both directions — if a pattern was stored as "MCDONALD'S NORTH SYDNEY", the query for "McDonald's North Sydney 2060" must normalize to the same string.
