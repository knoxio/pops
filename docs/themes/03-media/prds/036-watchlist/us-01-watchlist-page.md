# US-01: Watchlist page

> PRD: [036 — Watchlist](README.md)
> Status: Done

## Description

As a user, I want a prioritised watchlist page that shows movies and TV shows I plan to watch, so that I can manage what to watch next.

## Acceptance Criteria

- [x] Watchlist page renders at `/media/watchlist`
- [x] Desktop layout: poster grid with numbered priority badges in the top-left corner of each card
- [x] Mobile layout: compact list with poster thumbnail, title, and priority number
- [x] Priority badges display sequential numbers (1, 2, 3...) matching the current sort order
- [x] Filter tabs: "All", "Movies", "TV Shows" — active tab updates `?type=` query param
- [x] Filter tabs update the displayed list without a full page reload
- [x] Each item shows optional notes text below the poster/title (truncated with expand on click)
- [x] Page calls `media.watchlist.list` with type filter parameter
- [x] Items are ordered by priority ASC, then addedAt DESC
- [x] Empty state: "Your watchlist is empty" with links to the library page and search page
- [x] Loading state: skeleton matching the active layout (grid for desktop, list for mobile)
- [x] Filter-specific empty state: "No movies on your watchlist" or "No TV shows on your watchlist"
- [x] Tests cover: grid layout renders on desktop viewport, list layout renders on mobile viewport, filter tabs switch content, priority badges show correct numbers, notes display and truncation, empty state renders

## Notes

The responsive switch between grid and list layout should use CSS breakpoints or a container query — not JavaScript window width detection. Priority badges use a circular style with solid background for visibility against poster images. Notes can be multi-line but should be collapsed to a single line in the default view.
