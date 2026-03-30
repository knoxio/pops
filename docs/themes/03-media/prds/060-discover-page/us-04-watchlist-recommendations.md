# US-04: From Your Watchlist

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want recommendations based on movies in my watchlist so that I can find similar content to what I've already saved to watch.

## Acceptance Criteria

- [ ] "From Your Watchlist" section renders as a `HorizontalScrollRow`
- [ ] Source: all movie-type items on the POPS watchlist
- [ ] For each watchlist movie, fetch TMDB `/movie/{id}/similar` (page 1)
- [ ] Results merged across all watchlist sources, deduplicated by `tmdbId`
- [ ] Exclude movies already in the library, on the watchlist, or dismissed
- [ ] Each card includes attribution: "Because {watchlist movie} is on your list"
- [ ] Results scored by preference profile and sorted by match percentage
- [ ] Subtitle: "Similar to movies on your watchlist"
- [ ] Hidden when the watchlist is empty
- [ ] If no results after filtering, show "Add more movies to your watchlist to get suggestions"
- [ ] New `media.discovery.watchlistRecommendations` tRPC query
- [ ] Tests cover: results from watchlist sources, exclusions, attribution, empty state

## Notes

Uses TMDB's `/movie/{id}/similar` endpoint (not `/recommendations`) since similar is content-based and recommendations is collaborative — similar tends to give more relevant results for "more like this" use cases. Cap the number of watchlist items queried to 10 (the most recently added) to avoid excessive API calls for large watchlists.
