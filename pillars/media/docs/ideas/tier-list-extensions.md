# Idea: Tier list extensions

Forward-looking work on the batch tier list (`/media/tier-list`) beyond what
ships today. The current page is single-dimension, movie-only, persists
placements as `tier_overrides`, and converts a round into `tier_list`-sourced
comparisons via greedy new-pair coverage.

## Cross-dimension rounds

Today each round targets exactly one dimension; a movie must be re-ranked per
dimension separately. A cross-dimension mode would let the user place a pool
once and capture tier placements for several dimensions in a single pass (e.g.
S on "Rewatchability" but B on "Plot"), generating per-dimension comparison
batches from one board. Needs a UI for switching the active dimension without
losing the board, and a submit shape carrying placements keyed by dimension.

## Post-submit batch undo

A submitted round writes many comparisons at once; today the only recourse is
deleting individual comparisons from history (which triggers a dimension
recalc each time). A first-class "undo this tier-list batch" action would
delete every comparison tagged to that submission (a batch/submission id on
`comparisons`) and recalc once. Requires stamping submitted comparisons with a
shared batch id.

## TV-show tier lists

The selection query hardcodes `media = 'movie'`. Extending the tier list to TV
shares the same blockers as the rest of the comparisons engine — tracked in
[comparisons-tv-and-ai](comparisons-tv-and-ai.md) (the `tier_overrides` table
already carries a `media_type` column).
</content>
