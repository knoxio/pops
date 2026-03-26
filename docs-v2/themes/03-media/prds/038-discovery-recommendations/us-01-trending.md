# US-01: Trending section

> PRD: [038 — Discovery & Recommendations](README.md)
> Status: Partial

## Description

As a user, I want to see trending movies on the discovery page so that I can find popular new content to add to my library.

## Acceptance Criteria

- [x] Trending section renders at the top of the `/media/discover` page
- [x] Displays a grid of TMDB trending movies with poster, title, and year
- [ ] Day/week toggle: "Today" and "This Week" buttons switch the time window — no toggle UI; only "This Week" hardcoded (`timeWindow: "week"`)
- [ ] Active time window is highlighted; default is "This Week" — no toggle UI
- [ ] Time window selection persists in `?window=day` or `?window=week` query param — not implemented
- [x] Each movie card has an "Add to Library" button
- [x] "Add to Library" creates the movie in the POPS library using TMDB metadata (title, poster, genres, overview, etc.)
- [x] Movies already in the library show an "In Library" badge instead of the "Add to Library" button
- [x] "In Library" check is performed client-side against the library list (or via a batch lookup endpoint)
- [ ] Pagination via "Load More" button or infinite scroll for additional trending results — results sliced to 20 with no load-more
- [x] Page calls `media.discovery.trending` with time window and page parameters
- [x] If TMDB API fails, display an error message with a "Retry" button — other page sections are unaffected
- [x] Loading state: skeleton poster grid while trending data loads
- [ ] Tests cover: grid renders trending movies, day/week toggle switches results, add to library creates movie, "In Library" badge for existing movies, error state with retry, pagination loads more

## Notes

TMDB's trending endpoint returns up to 20 results per page. The "Add to Library" action should fetch full movie details from TMDB (not just the trending summary) before creating the record, since the trending response has limited fields. The "In Library" check should match on TMDB ID, not title.
