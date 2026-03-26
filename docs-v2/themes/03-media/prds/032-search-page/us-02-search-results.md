# US-02: Search results display

> PRD: [032 — Search Page](README.md)
> Status: Partial

## Description

As a user, I want to see search results from both TMDB and TheTVDB displayed clearly so that I can identify the movie or TV show I am looking for.

## Acceptance Criteria

- [x] Results are displayed in two sections (or tabs): "Movies" and "TV Shows"
- [x] Each result card shows: poster thumbnail, title, release year, overview snippet (truncated to 2-3 lines)
- [x] Poster thumbnail uses a fallback placeholder if the API returns no image URL
- [x] Each section has its own independent loading state (spinner or skeleton cards) — one section can show results while the other is still loading
- [x] Each section has its own empty state: "No [movies/shows] found for [query]"
- [ ] Each section has its own error state with a "Retry" button that re-fires only that section's API call — single combined error state covers both sections; not per-section
- [x] Results that already exist in the local library display an "In Library" badge instead of an "Add" button
- [x] "In Library" detection calls `media.library.list` (or checks a local cache of existing tmdbIds/tvdbIds) to compare against result IDs
- [ ] Result list is scrollable; results are capped at a reasonable limit (e.g., 20 per section) matching API response size — no per-section result cap enforced
- [ ] Tests cover: both sections render independently, poster fallback, "In Library" badge appears for existing items, per-section loading/empty/error states, overview truncation

## Notes

The "In Library" check should be efficient — fetching the list of owned tmdbIds/tvdbIds once (or from a query cache) and checking in-memory, rather than making a per-result API call. The "Add to Library" button itself is implemented in US-03; this story handles rendering the badge when an item is already owned.
