# US-02: Correction matching (Stage 0)

> PRD: [021 — Entity Matching Engine](README.md)
> Status: Done

## Description

As a developer, I want transaction descriptions matched against learned correction rules before other strategies so that user corrections have the highest priority.

## Acceptance Criteria

- [x] Query `v_active_corrections` view (confidence >= 0.7) for matching patterns
- [x] Description normalized before matching: uppercase, remove numbers, normalize whitespace
- [x] Priority: exact match first, then contains match
- [x] Ties broken by: highest confidence, then highest times_applied
- [x] If match confidence >= 0.9 → result is "matched"
- [x] If match confidence < 0.9 → result is "uncertain"
- [x] Matched correction provides: entity_id, entity_name, location, tags, transaction_type
- [x] If correction matches, skip all subsequent matching stages

## Notes

Corrections represent learned user intent — they always win. The confidence threshold (0.7 for active, 0.9 for high-confidence) ensures only reliable rules are auto-applied.
