# US-06: Comparison history and delete

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Partial

## Description

As a user, I want to see my past comparisons and undo mistakes so that a misclick doesn't permanently skew my rankings.

## Acceptance Criteria

- [x] Comparison history page or section accessible from the compare arena or rankings page
- [ ] History shows: both items compared (poster + title), winner, dimension, date
- [x] History ordered by date DESC (most recent first)
- [x] Pagination or infinite scroll for long history
- [x] Delete button per comparison with confirmation dialog
- [x] On delete, Elo scores are recalculated — both items' scores for that dimension are recomputed from remaining comparisons
- [ ] Undo toast after delete (5-second window to reverse the deletion before recalculation commits)
- [x] Filter by dimension (dropdown matching the rankings dimension selector)
- [x] Empty state: "No comparisons yet" with CTA to compare arena
- [ ] Tests cover: history list, delete with Elo recalculation, undo, filter by dimension

## Notes

Elo recalculation on delete is not trivial — the simplest approach is to replay all remaining comparisons for the affected dimension in chronological order from the starting score (1500). This is acceptable given the expected volume (hundreds, not millions). Alternative: just subtract the Elo delta from the deletion, which is faster but less accurate if many comparisons exist.
