# US-02: Library grid page

> PRD: [031 — Library Page](README.md)
> Status: To Review

## Description

As a user, I want a responsive grid of my media library with filtering, sorting, and search so that I can browse and find items quickly.

## Acceptance Criteria

- [ ] Library page renders at `/media` (default media route)
- [ ] Responsive grid layout: 2 columns (mobile) → 3 (sm) → 4 (md) → 5 (lg) → 6 (xl)
- [ ] Type filter tabs: "All", "Movies", "TV Shows" — selected tab updates `?type=` query param
- [ ] Sort select dropdown with options: Date Added (default), Title (A-Z), Release Date, Rating — updates `?sort=` query param
- [ ] Search input filters by title — updates `?q=` query param; debounced at 300ms
- [ ] All filter/sort/search state is persisted in URL query parameters
- [ ] Page-based pagination with page size selector (24/48/96 items per page)
- [ ] Pagination controls show current page, total pages, and previous/next buttons
- [ ] Type badge on MediaCard is hidden when a specific type filter is active, shown when "All" is selected
- [ ] Grid calls `media.library.list` with current type, sort, search, page, and page size
- [ ] Grid re-fetches when any filter/sort/search parameter changes
- [ ] Tests cover: grid renders correct column count at breakpoints, type filter switches results, sort reorders items, search filters by title, pagination navigates correctly, query params persist state

## Notes

Use URL query parameters as the source of truth for filter state — this makes the page bookmarkable and supports browser back/forward. The `media.library.list` procedure handles server-side filtering and sorting. Client-side search can supplement for instant feedback while the server request is in flight.
