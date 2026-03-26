# PRD-041: Radarr Request Management

> Epic: [07 — Radarr & Sonarr](../../epics/07-radarr-sonarr.md)
> Status: Not started

## Overview

Request movies from within POPS via Radarr. Add movies to Radarr with quality profile selection, trigger searches, manage monitoring. Evolves POPS toward replacing Overseerr as the single request interface.

## Integration Points

The request action surfaces on existing movie pages, not on a dedicated route.

| Location | Action |
|----------|--------|
| Movie detail page | "Request" button in header area (if movie is not already in Radarr) |
| Search results | "Request" action alongside "Add to Library" |
| Discovery/recommendations | "Request" action on recommended movie cards |

## Request Flow

1. User clicks "Request" on a movie
2. Modal opens with quality profile selector and root folder selector (fetched from Radarr API)
3. User confirms — POST to Radarr adds the movie with `monitored: true` and `searchForMovie: true`
4. Modal closes, status badge updates to "Monitored" or "Downloading"

## UI Components

### RequestMovieModal

| Element | Detail |
|---------|--------|
| Movie title + year | Confirmation header showing what is being requested |
| Quality profile select | Dropdown populated from Radarr's quality profiles |
| Root folder select | Dropdown populated from Radarr's root folders (shows path + free space) |
| Confirm button | "Request" — triggers the add + search |
| Cancel button | Closes modal without action |
| Loading state | Spinner on confirm button while request is in flight |
| Success state | Brief success message, then modal closes |
| Error state | Inline error message (e.g., "Movie already exists in Radarr") |

### Request Button

| Element | Detail |
|---------|--------|
| Visibility | Hidden if movie already exists in Radarr (checked via TMDB ID lookup) |
| Disabled state | Disabled if Radarr is not configured (from `media.arr.getConfig()`) |
| Tooltip | "Radarr not configured" when disabled |

## API Surface

### media.radarr

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `getQualityProfiles` | (none) | `{ data: QualityProfile[] }` | Proxies `GET /api/v3/qualityprofile` |
| `getRootFolders` | (none) | `{ data: RootFolder[] }` | Proxies `GET /api/v3/rootfolder` — includes path and freeSpace |
| `checkMovie` | tmdbId | `{ exists, radarrId?, monitored? }` | Proxies `GET /api/v3/movie?tmdbId=X` |
| `addMovie` | tmdbId, title, qualityProfileId, rootFolderPath | `{ data: RadarrMovie }` | Proxies `POST /api/v3/movie` with `monitored: true`, `addOptions: { searchForMovie: true }` |
| `updateMonitoring` | radarrId, monitored | `{ data: RadarrMovie }` | Proxies `PUT /api/v3/movie/:id` |
| `triggerSearch` | radarrId | `{ message }` | Proxies `POST /api/v3/command` with `{ name: "MoviesSearch", movieIds: [id] }` |

## Business Rules

- Requesting a movie adds it to Radarr AND triggers an automatic search — the user does not need to manually search after requesting
- Quality profiles and root folders are fetched fresh each time the modal opens (not cached) — these change infrequently but correctness matters more than speed here
- The "Request" button is absent (not disabled) when the movie already exists in Radarr — the status badge conveys that it is already tracked
- The "Request" button is disabled (with tooltip) when Radarr is not configured — the user needs to set up Radarr first
- Root folder display includes free disk space so the user can make an informed choice
- `addMovie` sends the TMDB ID, title, quality profile ID, and root folder path — Radarr fetches remaining metadata from TMDB itself

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Movie already exists in Radarr | `checkMovie` returns `exists: true`; "Request" button not rendered |
| Radarr not configured | "Request" button disabled with tooltip |
| Radarr unreachable when modal opens | Modal shows error state, selectors empty, confirm disabled |
| Quality profiles empty | Modal shows "No quality profiles found" — confirm disabled |
| Root folders empty | Modal shows "No root folders found" — confirm disabled |
| Add movie fails (Radarr returns error) | Modal shows inline error message from Radarr |
| Add movie succeeds but search fails | Movie is added (success), search failure is logged but not shown to user — Radarr will retry automatically |
| User clicks Request on search results before adding to POPS library | Movie is added to Radarr only; it is not automatically added to the POPS library |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-radarr-api-client](us-01-radarr-api-client.md) | Radarr v3 API client — quality profiles, root folders, add movie, check existence, update monitoring, trigger search | Yes |
| 02 | [us-02-request-modal](us-02-request-modal.md) | Request modal with quality profile selector, root folder selector, confirm action, search trigger | Blocked by us-01 |
| 03 | [us-03-request-integration](us-03-request-integration.md) | "Request" button on movie detail, search results, and discovery; state-aware visibility | Blocked by us-01, us-02 |

US-01 is the API layer. US-02 builds the modal component. US-03 integrates the button and modal into existing pages.

## Dependencies

- PRD-040 (Arr Status Display) — base client factory and settings configuration

## Out of Scope

- Sonarr integration (PRD-042)
- Bulk requesting multiple movies
- Quality profile management (create/edit profiles within POPS)
- Download queue management (pause/cancel/prioritise)
- Radarr tag management
