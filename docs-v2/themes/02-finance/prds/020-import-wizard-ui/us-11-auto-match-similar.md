# US-11: Auto-match similar transactions

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want the system to offer to apply my entity assignment to similar transactions so that I don't have to manually fix each one.

## Acceptance Criteria

- [x] When user assigns entity to a transaction, system finds other uncertain/failed with similar description
- [x] Similarity: case-insensitive, number-agnostic fuzzy matching (cleaned description comparison)
- [x] Toast notification: "Apply to N similar transactions?" with Accept/Dismiss
- [x] Accepting applies the entity to all similar transactions and moves them to matched
- [x] Count updates in tab badges immediately
- [x] Works for both dropdown selection and AI suggestion acceptance

## Notes

Uses `findSimilarTransactions()` utility — removes numbers, normalizes whitespace, uppercases, then compares. "IKEA TEMPE" and "IKEA RHODES" are similar because cleaned description starts with "IKEA".
