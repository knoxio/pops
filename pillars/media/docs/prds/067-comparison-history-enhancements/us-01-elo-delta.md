# US-01: ELO Delta Badges in Comparison History

> PRD: [PRD-067 — Comparison History Enhancements](README.md)

## Summary

Store ELO point changes (deltas) on each comparison record so the history page can show how many points each movie gained or lost.

## Acceptance Criteria

- [x] `comparisons` table has `delta_a INTEGER` and `delta_b INTEGER` nullable columns (migration `0022_elo_deltas.sql`)
- [x] `Comparison` API interface exposes `deltaA: number | null` and `deltaB: number | null`
- [x] `recordComparison` computes deltas (`round(K × (actual − expected))`) and stores them atomically with the comparison insert
- [x] History page rows show a green `+N` badge next to the winner and a red `-N` badge next to the loser
- [x] No badge is rendered when delta is null (historical records)
- [x] Existing comparisons with null deltas continue to display without errors

## Status: Done
