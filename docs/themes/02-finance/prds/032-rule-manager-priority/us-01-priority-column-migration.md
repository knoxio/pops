# US-01: Priority column migration

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Not started

## Description

As the system, I need a `priority` column on `transaction_corrections` so that rule evaluation order is explicit and user-controllable rather than derived from match type.

## Acceptance Criteria

- [ ] A migration adds `priority INTEGER NOT NULL DEFAULT 0` to the `transaction_corrections` table.
- [ ] The migration backfills existing rows: `exact` rules get priority in the 0--999 band, `contains` in 1000--1999, `regex` in 2000--2999. Within each band, rows are ordered by `confidence DESC`, `timesApplied DESC` and assigned sequential values with gaps of 10.
- [ ] `CorrectionRow` type includes `priority: number`.
- [ ] `Correction` domain type includes `priority: number`.
- [ ] `CreateCorrectionSchema` accepts an optional `priority` field (defaults to 0 if omitted).
- [ ] `UpdateCorrectionSchema` accepts an optional `priority` field.
- [ ] The `toCorrection` mapper reads `priority` from the row and maps it to the domain type.
- [ ] Existing unit tests for correction CRUD pass without modification (the default value must preserve current behaviour).

## Notes

The gap-of-10 strategy in the backfill leaves room for future user-inserted rules between existing ones without requiring a full renumber. The bands (0/1000/2000) are a one-time migration concern — after this, priority is purely user-controlled and match type has no bearing on ordering.
