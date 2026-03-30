# US-13: Edit transaction dialog

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to edit a transaction's details during review so that I can fix incorrect data before importing.

## Acceptance Criteria

- [x] Edit button on each transaction card opens a dialog
- [x] Editable fields: description, amount, account, entity (dropdown), location, type (purchase/transfer/income)
- [x] Pre-filled with current values
- [x] Save updates the transaction in Zustand store (not yet in database)
- [x] Cancel closes dialog without changes
- [x] Changing type to transfer/income makes entity optional (links to US-15)

## Notes

Edits are local (Zustand) until the final executeImport in Step 5. This dialog modifies the in-memory transaction, not the database.
