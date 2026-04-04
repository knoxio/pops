# US-01: History page

> PRD: [035 — Watch History](README.md)
> Status: Done

## Description

As a user, I want a chronological history of everything I've watched so that I can review my viewing habits and recall what I've seen recently.

## Acceptance Criteria

- [x] History page renders at `/media/history`
- [x] Page displays a list of watch events ordered by `watchedAt` descending (most recent first)
- [x] Each entry shows: poster thumbnail (60x90, 3-tier fallback), title, and watched date
- [x] Watched date displays as relative time ("2 days ago") with full ISO date on hover/tooltip
- [x] Filter tabs at the top: "All", "Movies", "Episodes" — active tab updates `?type=` query param
- [x] Only completed watches (`completed=1`) appear in the list
- [x] Page-based pagination with page size selector (20/50/100)
- [x] Pagination controls show current page, total pages, previous/next buttons
- [x] Page calls `media.watchHistory.listRecent` with type filter and pagination params
- [x] List re-fetches when filter or page changes
- [x] Empty state renders "Nothing watched yet" with a link to the library page
- [x] Loading state shows skeleton rows matching entry dimensions
- [x] Filter-specific empty state: "No movies watched yet" or "No episodes watched yet" when a filter is active but has no results
- [x] Tests cover: list renders in correct order, filter tabs switch content, pagination navigates, empty state renders, loading skeleton renders

## Notes

Use URL query parameters as the source of truth for filter and page state so the page is bookmarkable. The `listRecent` procedure returns watch events already enriched with media metadata (title, posterUrl). Poster thumbnails use the same 3-tier fallback as MediaCard but at a smaller size.
