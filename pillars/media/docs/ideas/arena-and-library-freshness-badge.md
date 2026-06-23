# Freshness badge on arena cards and library

The `FreshnessBadge` component exists and ships on the movie detail page (via `MovieHeroActions`). It does not yet render anywhere else.

Two placements were specified but never built:

- **Compare-arena cards.** Show the badge on both comparison cards so the user can decide whether to mark a movie stale without leaving the arena flow. `ComparisonMovieCard` currently renders no freshness/staleness signal; it would need `daysSinceWatch` + `staleness` plumbed in for each side of the pair.
- **Library page.** Surface freshness as an opt-in sort option or filter (not a badge on every card by default), so the library can be reordered by how recently each title was watched.

Both reuse the existing `FreshnessBadge` and the same `daysSinceLastWatch` / `staleness` signals the pair-selection algorithm already computes — this is a pure presentation extension, no new backend.

## Acceptance criteria (when built)

- Freshness badge renders on both arena comparison cards, driven by each movie's most-recent non-blacklisted watch and its `comparison_staleness` value.
- Library page offers a freshness sort/filter; the badge is not forced onto every card.
- Stale override (`staleness < 1.0` → red "Stale") and the null-days "no badge for unwatched" rule hold in every placement.
