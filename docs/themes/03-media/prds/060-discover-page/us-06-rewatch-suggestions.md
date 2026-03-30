# US-06: Rewatch Suggestions

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want suggestions for movies worth rewatching based on what I've rated highly in the past, so that I can revisit favourites I may have forgotten about.

## Acceptance Criteria

- [ ] "Worth Rewatching" section renders as a `HorizontalScrollRow`
- [ ] Source: POPS watch history joined with ELO scores
- [ ] Only includes movies watched 6+ months ago (not recently watched)
- [ ] Only includes movies with above-median ELO score (or top 50% by voteAverage if no ELO data)
- [ ] Sorted by ELO score descending (highest-rated movies first)
- [ ] Limited to 20 results
- [ ] Subtitle: "Movies you loved — worth another watch"
- [ ] Cards show poster, title, year, and the user's ELO score or match percentage
- [ ] Cards link to the movie detail page (these are already in the library)
- [ ] Hidden when the user has no watch history older than 6 months
- [ ] New `media.discovery.rewatchSuggestions` tRPC query
- [ ] Tests cover: 6-month filter, score threshold, sorting, empty state

## Notes

The 6-month threshold prevents suggesting movies the user watched last week. This is a local-only query (no external API calls) — all data is in POPS's watch_history and media_scores tables. The cards should feel different from the other sections since these are owned movies, not discovery candidates — consider showing a "Rewatch" action instead of "Add to Library".
