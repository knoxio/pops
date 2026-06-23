# Idea: weighted composite recommendation scoring + per-card attribution

The discovery recommendations engine ([prds/discovery-recommendations](../prds/discovery-recommendations/README.md)) ships, but three things the original PRD specified were never built that way. Capture them here as forward-looking work, not as shipped behaviour.

## 1. Weighted composite score

The PRD specified a three-factor composite:

```
score = (genre_affinity * 0.5) + (tmdb_vote_average / 10 * 0.3) + (source_boost * 0.2)
```

with `source_boost` being the normalised ELO of the source movie that surfaced the recommendation.

**What's actually built:** a genre-affinity-only match percentage — `matchPercentage = round(50 + avg_genre_affinity * 48)` — and the candidate merge is sorted by raw TMDB **popularity** before re-scoring. TMDB vote average and source-boost do not feed the score at all.

To build the composite: thread the seed movie's ELO through to each candidate it surfaced, normalise vote average and source ELO to 0–1, and blend the three factors at the specified weights instead of the flat `50 + avg*48` mapping. Decide whether this replaces `matchPercentage` or sits alongside it.

## 2. Seed by ELO, not vote average

Recommendation seeds are currently the top library movies by **TMDB vote average** (`getTopRatedSourceMovies`). The intent was top movies by the user's own **overall ELO** (their actual rating behaviour, not TMDB's crowd score). Switch the seed query to order by average `media_scores.score`.

## 3. Per-card "Because you liked {Movie}" attribution

The recommendations response returns `sourceMovies` as a flat array of seed titles — there is no per-result link back to the specific seed that surfaced it. To deliver the "Because you liked X" label per card, carry the originating seed title (or id) onto each merged result during the merge, surviving dedupe (keep the highest-scoring origin), and render it on the recommendation card.

## 4. Fixed trending / recommendations UI sections

The original PRD described three fixed sections on `/media/discover`: a Trending row with a Today/This Week toggle, a `?window=day` query param, "Add to Library"/"In Library" per card, and "Load More" pagination; a separate "Recommended for You" section with a composite-score badge and the per-card attribution above; and the preference profile.

**What's actually built:** a dynamic shelf-assembly page. Trending and recommendations exist as shelves selected (or not) by the session assembler, not as guaranteed fixed sections, and there is no day/week toggle, no `?window` param, and no dedicated "Load More" trending control in the UI (the `discovery.trending` / `discovery.recommendations` endpoints support windowing and paging, but the page doesn't expose them). If a guaranteed, toggle-driven Trending section is wanted, pin it and add the toggle UI against the existing `GET /discovery/trending` endpoint; likewise expose a dedicated recommendations section with the composite badge once (1)–(3) land.
