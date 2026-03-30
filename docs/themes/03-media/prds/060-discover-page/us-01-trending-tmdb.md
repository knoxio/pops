# US-01: Trending on TMDB

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to browse globally trending movies from TMDB so that I can discover popular content and add it to my library or watchlist.

## Acceptance Criteria

- [ ] "Trending" section renders as a `HorizontalScrollRow` on the discover page
- [ ] Day/week toggle: "Today" and "This Week" pill buttons switch the TMDB time window
- [ ] Active time window highlighted; default is "This Week"
- [ ] Time window persists in URL query param (`?window=day`)
- [ ] "Load More" button appends the next page of results
- [ ] Results are deduplicated by `tmdbId` when accumulating pages — TMDB's trending list shifts between requests
- [ ] Each card shows poster, title, year, TMDB rating badge
- [ ] Cards have hover actions: Add to Library, Add to Watchlist, Mark as Watched, Request, Not Interested
- [ ] Movies already in the library show an "Owned" badge
- [ ] TMDB API failure shows error with retry button; other sections unaffected
- [ ] Loading skeleton while first page loads
- [ ] Page calls `media.discovery.trending` with `{ timeWindow, page }`
- [ ] Tests cover: rendering, day/week toggle, load more deduplication, add to library action

## Notes

TMDB trending returns ~20 results per page. The deduplication must happen on the frontend during accumulation since TMDB doesn't guarantee stable pagination when the underlying list is dynamic.
