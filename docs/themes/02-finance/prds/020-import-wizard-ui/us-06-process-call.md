# US-06: Call processImport

> PRD: [020 — Import Wizard UI](README.md)
> Status: Partial

## Description

As a developer, I want the processing step to call the backend processImport endpoint so that dedup, matching, and AI categorization run server-side.

## Acceptance Criteria

- [x] Calls `finance.imports.processImport` with ParsedTransaction[] and account
- [x] Receives session ID immediately (backend processes in background)
- [x] Session ID stored in Zustand for progress polling
- [ ] Error handling: network failure shows retry option
- [x] Loading state while waiting for session ID

## Notes

This is the handoff from frontend to backend. The actual processing logic is in PRD-021 and PRD-022. This US just makes the call and stores the session ID.
