# US-09: Transaction card component

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want each transaction displayed as a card with key information so that I can quickly review what was imported.

## Acceptance Criteria

- [ ] Card shows: description, amount (colour-coded), date, account
- [ ] If entity matched: entity name + match type badge (alias/exact/prefix/contains/AI)
- [ ] If uncertain: AI suggestion with confidence indicator
- [ ] If failed: error message
- [ ] Card has hover state and is interactive (click for edit dialog)
- [ ] Amount formatted with currency symbol, 2 decimals, red/green

## Notes

Reusable across all four tabs. The card's interactive elements (entity dropdown, edit button) are added by parent components (US-10, US-13).
