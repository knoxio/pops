# PRD-031: Library Page

> Epic: [02 — App Package & Core UI](../../epics/02-app-package-ui.md)
> Status: Partial

## Overview

Build the media library — a responsive grid of all owned movies and TV shows. Filter by type, sort by multiple criteria, search by title. This is the entry point to the media app and the default route.

## Routes

| Route | Page |
|-------|------|
| `/media` | Library (default) |
| `/media/` | Library (alias) |

## UI Components

### MediaCard

| Element | Detail |
|---------|--------|
| Poster image | 3-tier fallback: user override → cached poster → placeholder SVG |
| Title | Below poster, truncated to 2 lines |
| Year | Below title, muted text |
| Type badge | "Movie" or "TV" badge, shown only when type filter is "All" |
| Click target | Entire card — navigates to `/media/movies/:id` or `/media/tv/:id` |

### Library Page

| Element | Detail |
|---------|--------|
| Type filter tabs | All / Movies / TV Shows |
| Sort select | Date Added (default), Title (A-Z), Release Date, Rating |
| Search input | Filters by title (client-side for current page, query param for server) |
| Grid | Responsive: 2 cols (mobile) → 3 (sm) → 4 (md) → 5 (lg) → 6 (xl) |
| Pagination | Page-based with page size selector (24/48/96) |
| Empty state | "Add your first movie or show" with link to `/media/search` |
| Loading state | Skeleton grid matching poster card dimensions |
| Error state | Error message with retry button |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.library.list` | Fetch paginated library items with type filter, sort, search |

## Business Rules

- Library is the default media route — `/media` renders the library page
- Type filter is a query parameter (`?type=movie`, `?type=tv`, or absent for all)
- Sort and search are also query parameters, persisted in URL for shareability
- MediaCard poster uses a 3-tier fallback chain: check for user-uploaded override, then cached API poster, then a generic placeholder
- Type badge on MediaCard is hidden when filtering by a specific type (redundant information)
- Empty library shows a CTA pointing to the search page, not a blank grid

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Library is empty | Empty state with CTA to search page |
| Poster image fails to load | Falls through to next tier in fallback chain; placeholder is always the final tier |
| Search with no matches | "No results for [query]" with clear search button |
| Large library (500+ items) | Pagination prevents rendering all cards; server-side filtering keeps responses fast |
| Title is very long | Truncated to 2 lines with ellipsis |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-media-card](us-01-media-card.md) | MediaCard component with poster fallback chain, title, year, type badge, click navigation | Partial | No (first) |
| 02 | [us-02-library-grid](us-02-library-grid.md) | Library page with responsive grid, type filter tabs, sort select, search input, pagination | Partial | Blocked by us-01 |
| 03 | [us-03-empty-loading-states](us-03-empty-loading-states.md) | Empty state with CTA, loading skeleton grid, error state with retry | Partial | Yes (parallel with us-02) |

US-02 depends on US-01 (needs MediaCard). US-03 can be built in parallel with US-02 (independent state components).

## Verification

- Grid renders correct number of columns at each breakpoint
- Type filter tabs filter correctly (all, movies only, TV only)
- Sort changes order (date added, title, release date, rating)
- Search filters by title in real time
- Pagination navigates through pages with correct counts
- MediaCard poster fallback chain works when images are missing
- Empty state appears when library has no items
- Loading skeletons render while data fetches

## Out of Scope

- Adding items to library (PRD-032: Search Page)
- Movie/show detail views (PRD-033, PRD-034)
- Watch status indicators on cards (Epic 03: Tracking & Watchlist)
- Comparison scores on cards (Epic 04: Ratings & Comparisons)
