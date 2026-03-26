# US-02: Library grid page

> PRD: [031 — Library Page](README.md)
> Status: Done

## Description

As a user, I want a responsive grid of my media library with filtering, sorting, and search so that I can browse and find items quickly.

## Acceptance Criteria

- [x] Library page renders at `/media` (default media route)
- [x] Responsive grid layout: 2 columns (mobile) → 3 (sm) → 4 (md) → 5 (lg) → 6 (xl)
- [x] Type filter tabs: "All", "Movies", "TV Shows" — selected tab updates `?type=` query param
- [x] Sort select dropdown with options: Date Added (default), Title (A-Z), Release Date, Rating — updates `?sort=` query param
- [x] Search input filters by title — updates `?q=` query param; debounced at 300ms
- [x] All filter/sort/search state is persisted in URL query parameters
- [x] Page-based pagination with page size selector (24/48/96 items per page)
- [x] Pagination controls show current page, total pages, and previous/next buttons
- [x] Type badge on MediaCard is hidden when a specific type filter is active, shown when "All" is selected
- [x] Grid calls `media.library.list` with current type, sort, search, page, and page size
- [x] Grid re-fetches when any filter/sort/search parameter changes
- [x] Tests cover: type filter, sort, search, genre filter, pagination, poster URL generation, combined filters

## Notes

Use URL query parameters as the source of truth for filter state — this makes the page bookmarkable and supports browser back/forward. The `media.library.list` procedure handles server-side filtering and sorting. Client-side search can supplement for instant feedback while the server request is in flight.
