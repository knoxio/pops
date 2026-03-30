# US-03: Auto-cleanup on low confidence

> PRD: [024 — Corrections](README.md)
> Status: Done

## Description

As a developer, I want corrections auto-deleted when confidence drops below 0.3 so that unreliable rules don't pollute the system.

## Acceptance Criteria

- [x] `adjustConfidence` clamps result to [0, 1] range
- [x] If new confidence < 0.3 after adjustment, correction is deleted
- [x] Deletion is immediate (not deferred)
- [x] Test: create correction at 0.5, adjust by -0.3 → confidence 0.2 → deleted

## Notes

The 0.3 threshold is hardcoded. Corrections that users repeatedly reject will naturally decay and be cleaned up.
