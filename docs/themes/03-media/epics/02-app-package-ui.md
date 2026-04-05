# Epic 02: App Package & Core UI

> Theme: [Media](../README.md)

## Scope

Build `@pops/app-media` — the workspace package with all media UI pages. Library browsing, external search with add-to-library, and detail views for movies and TV shows.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 031 | [Library Page](../prds/031-library-page/README.md) | Grid view of owned media, filter by type (movie/TV), sorting, poster cards | Partial |
| 032 | [Search Page](../prds/032-search-page/README.md) | Query TMDB/TheTVDB, display results, add-to-library flow with metadata fetch | Partial |
| 033 | [Movie Detail Page](../prds/033-movie-detail-page/README.md) | Movie metadata display, poster/backdrop, cast, watch status, comparison scores, actions | Done |
| 034 | [TV Show Detail Page](../prds/034-tv-show-detail-page/README.md) | Show metadata, season list, episode drill-down, per-episode watch tracking, season detail page | Done |

PRD-031 and PRD-032 can be built in parallel. PRD-033 and PRD-034 can be built in parallel. All four depend on Epic 01 (metadata must be fetchable).

## Dependencies

- **Requires:** Epic 01 (metadata clients), Foundation Epic 02 (shell to mount into)
- **Unlocks:** Epics 03-05 (tracking, comparisons, discovery add features to these pages)

## Out of Scope

- Watch history/watchlist (Epic 03)
- Comparison scores and radar charts on detail pages (Epic 04)
- Discover/recommendations page (Epic 05)
