# US-21: Execute import

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to finalize the import and write transactions to the database so that the import is complete.

## Acceptance Criteria

- [ ] "Import" button calls `finance.imports.executeImport` with confirmed transactions
- [ ] Returns session ID for progress tracking
- [ ] Polls `getImportProgress` every 1.5 seconds
- [ ] Shows write progress: count / total
- [ ] On completion: stores import result (imported/failed/skipped counts) in Zustand
- [ ] Advances to Step 6 (Summary) on completion
- [ ] Button disabled while executing (no double-submit)
- [ ] Error handling: if execution fails, show error with retry option

## Notes

The execute step writes to SQLite synchronously (no async queue). Tags are JSON stringified. Each transaction gets a generated UUID.
