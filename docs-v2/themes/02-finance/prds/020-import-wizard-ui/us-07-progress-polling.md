# US-07: Progress polling UI

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to see real-time processing progress so that I know the import is working and how far along it is.

## Acceptance Criteria

- [ ] Polls `finance.imports.getImportProgress` every 1 second using session ID
- [ ] Displays: current step ("deduplicating", "matching", "writing"), processed count / total
- [ ] Shows current batch preview (last 5 items being processed with status)
- [ ] Progress bar or percentage indicator
- [ ] Stops polling when status = "completed"
- [ ] On completion: stores categorized results (matched/uncertain/failed/skipped/warnings) in Zustand and advances to Step 4
- [ ] Warning banner if AI categorization was unavailable

## Notes

Backend auto-cleans progress entries after 5 minutes. If the user leaves and comes back, the session may be gone — show a "session expired" message and offer restart.
