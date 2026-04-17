# PRD-032: Search Page

> Epic: [02 — App Package & Core UI](../../epics/02-app-package-ui.md)
> Status: Done

## Overview

Build a search page that queries TMDB for movies and TheTVDB for TV shows. Display results with metadata previews and an "Add to Library" action. Both APIs are queried in parallel; results are displayed in separate sections or tabs.

## Routes

| Route           | Page        |
| --------------- | ----------- |
| `/media/search` | Search page |

## UI Components

### Search Input

| Element      | Detail                                                |
| ------------ | ----------------------------------------------------- |
| Text input   | Full-width, prominent, auto-focused on mount          |
| Debounce     | 300ms after last keystroke before firing queries      |
| Clear button | Appears when input has text; clears input and results |
| Query param  | `?q=` — persisted in URL for shareability             |

### Result Sections

| Element                 | Detail                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Layout                  | Tab or section layout: "Movies (TMDB)" / "TV Shows (TheTVDB)"                      |
| Result card             | Poster thumbnail, title, year, overview snippet (2-3 lines, truncated)             |
| "Add to Library" button | Per-result action — triggers the add flow                                          |
| "In Library" badge      | Shown if tmdbId (movies) or tvdbId (TV shows) already exists in the local database |
| Loading state           | Per-section spinner/skeleton (one API may respond before the other)                |
| Empty state             | Per-section "No results" message when API returns zero matches                     |

### Add to Library Flow

| Step           | Detail                                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| Click "Add"    | Button shows spinner, disables to prevent double-click                               |
| API call       | `media.library.addMovie` (TMDB result) or `media.library.addTvShow` (TheTVDB result) |
| Success        | Button changes to "In Library" badge, toast confirmation appears                     |
| Already exists | Button pre-renders as "In Library" badge (idempotent — no error if added again)      |
| Failure        | Button reverts to "Add", error toast with message                                    |

## API Dependencies

| Procedure                 | Usage                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `media.search.movies`     | Search TMDB by query string (tRPC namespace `media.search`)        |
| `media.search.tvShows`    | Search TheTVDB by query string (tRPC namespace `media.search`)     |
| `media.library.addMovie`  | Add a movie to the library by TMDB ID (fetches full metadata)      |
| `media.library.addTvShow` | Add a TV show to the library by TheTVDB ID (fetches full metadata) |
| `media.library.list`      | Check which tmdbIds/tvdbIds are already in the library             |

## Business Rules

- Both APIs are queried in parallel on every search — no sequential dependency
- Results display as soon as each API responds (independent loading states)
- "In Library" detection checks the local database, not the external API
- Adding an item that already exists is idempotent — no duplicate rows, no error
- The add flow fetches full metadata from the external API and stores it locally; the search result itself is a preview only
- Search query is persisted in the URL (`?q=`) so the page can be bookmarked or shared

## Edge Cases

| Case                                          | Behaviour                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Empty query                                   | No API calls fired; both sections show placeholder text ("Search for movies and TV shows") |
| One API fails                                 | Failed section shows error message with retry; other section renders normally              |
| Both APIs fail                                | Both sections show error messages independently                                            |
| Query returns results in one section only     | The section with results renders; the other shows "No [movies/shows] found for [query]"    |
| Rapid typing                                  | Debounce (300ms) cancels in-flight requests; only the latest query executes                |
| Network timeout                               | Loading spinner times out after 10s; error message with retry                              |
| Item added while search results still visible | Button transitions to "In Library" badge without page reload                               |

## User Stories

| #   | Story                                                     | Summary                                                                              | Status | Parallelisable   |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ | ---------------- |
| 01  | [us-01-search-input](us-01-search-input.md)               | Debounced search input querying TMDB and TheTVDB in parallel                         | Done   | No (first)       |
| 02  | [us-02-search-results](us-02-search-results.md)           | Result cards with poster/title/year/overview, "In Library" badge, tab/section layout | Done   | Blocked by us-01 |
| 03  | [us-03-add-to-library-flow](us-03-add-to-library-flow.md) | Add button with spinner, addMovie/addTvShow call, success toast, badge update        | Done   | Blocked by us-02 |

US-02 depends on US-01 (needs search state). US-03 depends on US-02 (needs result cards to attach the button to).

## Verification

- Search queries both APIs in parallel and displays results independently
- Debounce prevents excessive API calls during rapid typing
- "In Library" badge appears for items already in the local database
- Adding an item transitions the button to "In Library" badge
- Adding an item that already exists does not create a duplicate
- Per-section loading and error states work independently
- Empty states are accurate per section

## Out of Scope

- Full metadata display (PRD-033: Movie Detail, PRD-034: TV Show Detail)
- Editing or removing library items
- Advanced search filters (genre, year range, etc.)
- Trending or recommended results (Epic 05: Discovery & Recommendations)

## Drift Check

last checked: 2026-04-17
