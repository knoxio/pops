# US-05: Proposal audit trail

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want traceability for rule changes made through proposals, so that I can understand why the system learned something and diagnose unexpected matches.

## Acceptance Criteria

- [x] Each proposal attempt is recorded with:
  - input transaction reference(s) (import-session scoped identifiers)
  - proposed ChangeSet operations
  - impact preview summary (counts)
  - outcome: approved / rejected
  - if rejected: feedback message
- [x] The audit trail is queryable for debugging and support (minimum: server-side logs; a persistent store may be added later).
