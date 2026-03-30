# US-02: Recommended for You

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want personalised movie recommendations based on my comparison data and watch history so that I can discover movies I'm likely to enjoy.

## Acceptance Criteria

- [ ] "Recommended for You" section renders as a `HorizontalScrollRow`
- [ ] Source movies: top 10-100 library movies by overall ELO score (configurable via `sampleSize` param, default 20)
- [ ] For each source movie, fetch TMDB `/movie/{id}/recommendations` (page 1)
- [ ] Results merged across all sources, deduplicated by `tmdbId`
- [ ] Movies already in the user's library are excluded
- [ ] Dismissed movies (Not Interested) are excluded
- [ ] Remaining results scored against the user's preference profile using genre affinity weights
- [ ] Score displayed as a match percentage badge (50-98% range)
- [ ] Each recommendation card includes attribution: "Because you liked {source movie title}"
- [ ] Results sorted by match percentage descending
- [ ] Subtitle shows source movie names: "Based on {Movie A}, {Movie B}, ..."
- [ ] Hidden entirely when the user has fewer than 5 recorded comparisons
- [ ] When hidden, a CTA card displays: "Compare more movies to unlock recommendations" linking to `/media/compare`
- [ ] If no new recommendations exist (all filtered out), show "No new recommendations — keep comparing"
- [ ] Calls `media.discovery.recommendations` with `{ sampleSize }` parameter
- [ ] Tests cover: recommendations render with attribution, cold start CTA, library exclusion, deduplication, scoring, empty state

## Notes

The scoring algorithm: for each candidate movie, map its TMDB genre IDs to genre names, look up the user's genre affinity scores (from comparison ELO or watch history distribution as fallback), compute a weighted average, and scale to 50-98%. More source movies = broader but slower recommendations. The `sampleSize` parameter controls this tradeoff.
