# PRD-067: Comparison History Enhancements

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Done

## Overview

The comparison history page shows a paginated list of past comparisons. This PRD adds richer information to each row: ELO point deltas (how many points each movie gained or lost), a search/filter bar, and fixes to the delete button UX.

## Data Model

### Schema change — `comparisons` table

Two new nullable integer columns are added:

| Column    | Type                 | Description                                     |
| --------- | -------------------- | ----------------------------------------------- |
| `delta_a` | `INTEGER` (nullable) | ELO point change for media A in this comparison |
| `delta_b` | `INTEGER` (nullable) | ELO point change for media B in this comparison |

Null for historical comparisons recorded before this field was added. Populated at comparison-record time using the same ELO formula already in `service.ts`.

**Formula:** `delta = round(K × (actual − expected))` where K = 32. Winner's delta is positive; loser's is negative. For draws, both deltas may be positive or negative depending on pre-draw expectations.

## API

No new endpoints. The `listAll` response (`Comparison` interface) gains two new fields:

```typescript
interface Comparison {
  // ... existing fields ...
  deltaA: number | null;
  deltaB: number | null;
}
```

`toComparison()` maps `row.deltaA ?? null` and `row.deltaB ?? null`.

## UI — History Row

Each comparison row shows ELO deltas inline, using compact coloured badges:

```
The Matrix  +12  beat  Inception  -12    CINEMATOGRAPHY  4/6/2026  [🗑]
```

- Green badge (`+N`) next to the winner
- Red badge (`-N`) next to the loser
- No badge shown if `deltaA`/`deltaB` is null (historical records)
- Badges are `text-2xs font-mono tabular-nums` with coloured background tint

## Business Rules

- Deltas are computed and stored atomically in the same transaction as the comparison insert
- ELO scores are updated before the comparison row is inserted, so deltas reflect the actual score change
- Existing comparisons with null deltas render without badges — no backfill needed
- For draws (`winnerId = 0`), the draw state is handled separately (see tb-321). ELO deltas are still stored and shown once the draw display is fixed
- **Stored deltas are point-in-time snapshots.** If ELO scores are retroactively recalculated (e.g. via comparison delete or blacklist), the stored deltas on existing rows are not updated. They reflect what the delta was at the moment the comparison was recorded, not the current net effect after recalculation. This is intentional — historical deltas are honest about what happened at that moment.

## User Stories

| #   | Story                                 | Summary                                                                      | Status |
| --- | ------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| 01  | [us-01-elo-delta](us-01-elo-delta.md) | Store ELO deltas on comparison record; display as coloured badges in history | Done   |

## Drift Check

last checked: 2026-04-17
