# US-03: Auto-cleanup on low confidence

> PRD: [024 — Corrections](README.md)
> Status: To Review

## Description

As a developer, I want corrections auto-deleted when confidence drops below 0.3 so that unreliable rules don't pollute the system.

## Acceptance Criteria

- [ ] `adjustConfidence` clamps result to [0, 1] range
- [ ] If new confidence < 0.3 after adjustment, correction is deleted
- [ ] Deletion is immediate (not deferred)
- [ ] Test: create correction at 0.5, adjust by -0.3 → confidence 0.2 → deleted

## Notes

The 0.3 threshold is hardcoded. Corrections that users repeatedly reject will naturally decay and be cleaned up.
