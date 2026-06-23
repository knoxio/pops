# Idea: TV-show comparisons + AI-driven pairings

Forward-looking extensions to the ratings & comparisons engine. The data model
already supports them (`media_type` columns on `comparisons`, `media_scores`,
`comparison_staleness`, `tier_overrides`), but the runtime is movies-only today:
watched-eligibility, smart-pair candidate building, quick-pick, tier-list
selection, and the arena/rankings UI all hardcode `media = 'movie'`.

## TV-show comparisons

Compare TV the way movies are compared. The hard part is the unit of
comparison: seasons within a show vary wildly in quality, so comparing whole
shows is mushy, but season-vs-season explodes the comparison space across the
whole library. Options to design through:

- season-level comparisons scoped within a genre,
- show-level comparisons restricted to "overall vibe" dimensions only,
- a separate TV ranking surface entirely.

Concretely, to ship: extend `fetchWatchedMovies` / candidate building to include
`tv_show` rows, broaden rankings/tier-list `media_type` clauses, add a media-type
toggle to the arena + rankings UI, and define TV eligibility (a watched season?
a finished show?).

## AI-driven comparison pairings

Replace the information-gain heuristic with model-picked pairings and prompts.
Instead of "Movie A vs Movie B on Cinematography", let a small model choose the
pairing and the question that would most refine the preference profile
("Which felt more claustrophobic?", "Which had the better twist?"), optionally
minting novel dimensions on the fly. Layers on top of the existing
`getSmartPair` selection rather than replacing the ELO engine.
