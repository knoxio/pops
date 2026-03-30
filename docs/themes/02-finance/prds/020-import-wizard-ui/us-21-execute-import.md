# US-21: Execute import

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to finalize the import and write transactions to the database so that the import is complete.

## Acceptance Criteria

- [x] "Import" button calls `finance.imports.executeImport` with confirmed transactions
- [x] Returns session ID for progress tracking
- [x] Polls `getImportProgress` every 1.5 seconds
- [x] Shows write progress: count / total
- [x] On completion: stores import result (imported/failed/skipped counts) in Zustand
- [x] Advances to Step 6 (Summary) on completion
- [x] Button disabled while executing (no double-submit)
- [x] Error handling: if execution fails, show error with retry option

## Notes

The execute step writes to SQLite synchronously (no async queue). Tags are JSON stringified. Each transaction gets a generated UUID.
