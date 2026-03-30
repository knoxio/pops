# US-01: Trending section

> PRD: [038 — Discovery & Recommendations](README.md)
> Status: Done

## Description

As a user, I want to see trending movies on the discovery page so that I can find popular new content to add to my library.

## Acceptance Criteria

- [x] Trending section renders at the top of the `/media/discover` page
- [x] Displays a horizontal scroll row of TMDB trending movies with poster, title, and year
- [x] Day/week toggle: "Today" and "This Week" pill buttons switch the time window
- [x] Active time window is highlighted; default is "This Week"
- [x] Time window selection persists in `?window=day` query param (week is default, omitted)
- [x] Each movie card has "Add to Library" and "Add to Watchlist" buttons
- [x] "Add to Library" creates the movie in the POPS library using TMDB metadata
- [x] Movies already in the library show an "In Library" badge
- [x] "In Library" check uses library TMDB ID set from the backend
- [x] Pagination via "Load More" button accumulates results across pages
- [x] Page calls `media.discovery.trending` with time window and page parameters
- [x] If TMDB API fails, display an error message with a "Retry" button
- [x] Loading state while trending data loads
- [x] Tests exist for trending section (DiscoverPage.test.tsx)

## Notes

TMDB's trending endpoint returns up to 20 results per page. The "Add to Library" action should fetch full movie details from TMDB (not just the trending summary) before creating the record, since the trending response has limited fields. The "In Library" check should match on TMDB ID, not title.
