# US-16: Review validation gate

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want the wizard to prevent me from advancing until all uncertain and failed transactions are resolved so that nothing gets imported in a broken state.

## Acceptance Criteria

- [x] "Continue to Tag Review" button disabled while uncertain or failed count > 0
- [x] Button shows remaining count: "Resolve N remaining"
- [x] Tooltip explains why button is disabled
- [x] Once all resolved (moved to matched or skipped via type override), button enables
- [x] If only skipped transactions remain (no matched), show appropriate messaging

## Notes

The gate ensures data quality. No unresolved transactions reach the tag review or database write steps.
