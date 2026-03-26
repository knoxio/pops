# US-22: Summary step

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to see the final import results so that I know what was imported, what failed, and what was skipped.

## Acceptance Criteria

- [ ] Imported count with ✅ icon
- [ ] Failed count with ❌ icon — expandable list with error details per transaction
- [ ] Skipped count with ⏸️ icon
- [ ] "New Import" button resets the wizard
- [ ] "View Transactions" button navigates to the transactions page
- [ ] No further data entry or edits — this is a completion confirmation

## Notes

Simple display step. The failed list helps debug issues. Most imports should show 100% imported with 0 failed.
