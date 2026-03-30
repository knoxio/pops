# US-22: Summary step

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to see the final import results so that I know what was imported, what failed, and what was skipped.

## Acceptance Criteria

- [x] Imported count with ✅ icon
- [x] Failed count with ❌ icon — expandable list with error details per transaction
- [x] Skipped count with ⏸️ icon
- [x] "New Import" button resets the wizard
- [x] "View Transactions" button navigates to the transactions page
- [x] No further data entry or edits — this is a completion confirmation

## Notes

Simple display step. The failed list helps debug issues. Most imports should show 100% imported with 0 failed.
