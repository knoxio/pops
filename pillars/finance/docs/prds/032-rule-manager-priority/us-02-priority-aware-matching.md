# US-02: Priority-aware matching

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Done

## Description

As the system, I want the matching algorithm to evaluate rules by explicit priority so that user-defined ordering determines which rule wins when multiple rules match a transaction.

## Acceptance Criteria

- [x] `findMatchingCorrection` sorts candidate rules by `priority ASC` (lower number = higher priority), with `id ASC` as tie-breaker.
- [x] `findMatchingCorrectionFromRules` uses the same `priority ASC`, `id ASC` sort order.
- [x] The old implicit hierarchy (exact > contains > regex) is removed — match type no longer affects evaluation order.
- [x] The first active rule at or above `minConfidence` in priority order wins. No further rules are evaluated for the winning match.
- [x] All callers of `findMatchingCorrection` and `findMatchingCorrectionFromRules` are updated to pass and handle the `priority` field.
- [x] Unit tests cover: (a) a lower-priority-number rule wins over a higher-priority-number rule regardless of match type, (b) two rules at the same priority tie-break by `id`, (c) a disabled rule is skipped and the next-priority active rule wins.
- [x] The backfilled priorities from US-01 produce identical match results to the pre-migration algorithm for all existing rules.

## Notes

This is a breaking change to match semantics — the backfill in US-01 exists specifically to make it non-breaking for existing data. Any test that hardcodes the old match-type hierarchy must be updated to use explicit priorities instead.
