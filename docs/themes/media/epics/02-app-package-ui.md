# Epic: App Package & Core UI

**Theme:** Media
**Priority:** 2 (first visible UI — depends on TMDB data)
**Status:** Done

## Goal

Create the `@pops/app-media` workspace package and build the core pages: library browsing, search, and detail views. This is the first app package plugged into the shell, validating the Foundation's multi-app architecture (ADR-002).

## Why third?

The data model (Epic 0) and TMDB integration (Epic 1) provide the backend. This epic provides the frontend. Without it, there's no way to interact with the media data outside of API calls.

## Scope

### In scope

- Create `packages/app-media/` workspace package:
  - `package.json` with `@pops/app-media` name
  - `tsconfig.json` extending the workspace base
  - Dependency on `@pops/ui` for shared components
- Export route definitions for the shell to lazily import
- Register media in the shell's app switcher (icon, label, route prefix)
- Pages:
  - **Library page** (`/media`) — grid/list of all movies and shows in the local library, filterable by genre, type (movie/tv), watched status, rating
  - **Movie detail page** (`/media/movies/:id`) — poster, backdrop, metadata, cast summary (from TMDB), watch status, rating scores
  - **TV show detail page** (`/media/tv/:id`) — poster, metadata, season list with episode counts, overall progress
  - **Season detail page** (`/media/tv/:id/season/:num`) — episode list with individual watch status
  - **Search page** (`/media/search`) — search TMDB (movies) and TheTVDB (TV) with results, "add to library" action per result
- Components:
  - `MediaCard` — poster thumbnail, title, year, type badge, watched indicator
  - `MediaGrid` — responsive grid layout for MediaCards
  - `MediaDetail` — full detail layout (poster, metadata, actions)
  - `EpisodeList` — season/episode browser with watch toggles
  - `SearchResults` — search result cards (TMDB/TheTVDB) with add-to-library action
- Responsive from day one — grid adjusts for mobile viewports (Foundation Epic 5 patterns)
- Stories for all new components in `packages/app-media/`

### Out of scope

- Watchlist management UI (Epic 3)
- Rating/comparison UI (Epic 4)
- Recommendation/discovery feeds (Epic 5)
- Plex or Radarr/Sonarr status indicators (Epics 6, 7)
- Any non-media pages

## Deliverables

1. `packages/app-media/` workspace package exists and builds cleanly
2. Shell lazily imports `@pops/app-media/routes` — media appears in the app switcher
3. Library page displays all local movies and shows with filtering
4. Movie and TV show detail pages display full TMDB metadata
5. Season/episode detail page shows episode list
6. Search page queries TMDB (movies) and TheTVDB (TV) and allows adding results to the library
7. All pages are responsive (mobile-first, tested at 375px and 768px breakpoints)
8. Storybook discovers and renders all media component stories
9. `pnpm typecheck` passes across all packages
10. No runtime regressions in existing finance app

## Target Routes

```
/media                    → Library (all movies + shows)
/media/movies/:id         → Movie detail
/media/tv/:id             → TV show detail
/media/tv/:id/season/:num → Season detail (episodes)
/media/search             → TMDB search + add to library
```

## Dependencies

- Foundation Epic 1 (UI Library Extraction) — `@pops/ui` must exist
- Foundation Epic 2 (Shell Extraction) — shell must support app packages and app switcher
- Epic 0 (Data Model) — tables to read from
- Epic 1 (Metadata Integration) — search and metadata endpoints

## Risks

- **First app package** — This is the first `@pops/app-*` package. If the shell's lazy import pattern, routing registration, or app switcher has bugs, they surface here. Mitigation: keep the UI simple initially. The goal is to prove the architecture, not build a polished product.
- **Component overlap with finance** — Some patterns (list/detail, grid/card) may already exist in finance. Mitigation: extract genuinely shared patterns to `@pops/ui` as they emerge. Don't pre-abstract — wait until the second use proves the pattern.
