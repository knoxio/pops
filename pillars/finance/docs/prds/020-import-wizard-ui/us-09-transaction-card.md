# US-09: Transaction card component

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want each transaction displayed as a card with key information so that I can quickly review what was imported.

## Acceptance Criteria

- [x] Card shows: description, amount (colour-coded), date, account
- [x] If entity matched: entity name + match type badge (alias/exact/prefix/contains/AI)
- [x] If uncertain: AI suggestion with confidence indicator
- [x] If failed: error message
- [x] Card has hover state and is interactive (click for edit dialog)
- [x] Amount formatted with currency symbol, 2 decimals, red/green

## Notes

Reusable across all four tabs. The card's interactive elements (entity dropdown, edit button) are added by parent components (US-10, US-13).
