# Search Page

Status: Done — search both providers, add to library, and run watchlist/watched actions from results.

The `/media/search` page queries TMDB (movies) and TheTVDB (TV shows) live, renders preview cards, and lets the user add an item to the library, the watchlist, or watch history in one click. It is a discovery entry point: full metadata lives on the detail pages, not here.

## Route

| Route           | Page                                 |
| --------------- | ------------------------------------ |
| `/media/search` | `SearchPage` (lazy, under the shell) |

## REST API surface

Search is contract-only metadata pass-through (`rest-search.ts`); no DB, each route proxies the env-configured provider client and surfaces upstream outages as `502`.

| Method | Path               | Purpose                                                                                                                                                                                                                                |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/search/movies`   | TMDB movie search. Query `query` (1–200 chars), optional `page`. Returns `{ results, totalResults, totalPages, page }` where each result carries `tmdbId`, title, overview, `releaseDate`, `posterPath`, vote/genre/popularity fields. |
| GET    | `/search/tv-shows` | TheTVDB series search. Query `query` (1–200 chars). Returns `{ results }` where each result carries `tvdbId`, `name`, `overview`, `firstAirDate`, `status`, `posterPath`, `genres`, `year`.                                            |

Library / watchlist / watch-history mutations consumed by this page (owned by their own PRDs):

| Method | Path                                   | Used for                                                               |
| ------ | -------------------------------------- | ---------------------------------------------------------------------- |
| POST   | `/library/movies`                      | Add a movie by `tmdbId` (idempotent; returns `{ data, created }`).     |
| POST   | `/library/tv-shows`                    | Add a TV show by `tvdbId` (idempotent; returns `{ data, created }`).   |
| GET    | `/library/movies`, `/library/tv-shows` | Resolve which `tmdbId`/`tvdbId` are already owned and their local ids. |
| POST   | `/watchlist`                           | Add `{ mediaType: 'movie', mediaId }` after a compound add.            |
| POST   | `/watch-history`                       | Log `{ mediaType: 'movie', mediaId }` (direct or compound).            |

Poster bytes for thumbnails are served by the non-contract `/media/images` static route (see the data-model PRD), not by these search endpoints.

## UI behaviour

### Search input

- [x] Full-width `search` input, auto-focused on mount, with a clearable affordance that resets the query.
- [x] A Movies / TV Shows / Both mode toggle (tabs) controls which providers are queried. `Both` is the default; `movies`/`tv` restrict the query and hide the other section.
- [x] Input value is debounced at 300ms via `useDebouncedValue`; only the debounced value drives queries.
- [x] The debounced value is written one-way to the `?q=` URL param with `setSearchParams({ replace: true })` (no per-keystroke history entries); the input is seeded from `?q=` on mount so a shared/bookmarked URL runs the search immediately.
- [x] An empty debounced query (length 0) fires no provider calls and shows the "Start typing to search…" prompt.

### Result sections

- [x] Movies and TV Shows render as independent sections; section headers only show in `Both` mode.
- [x] Each card shows poster thumbnail (placeholder fallback when `posterPath` is null), title, year, and a 2–3 line truncated overview.
- [x] Each section owns its loading and error states (the error carries a Retry that re-fires only that section's query); one provider can render while the other is still loading or failed.
- [x] The "No results found" message is page-level and shown only when both queried sections settle with zero combined results. A section that settles empty while the other has results renders nothing (no per-section empty message).
- [x] Results are capped at 20 per section.
- [x] React Query keys are scoped to the debounced query, so a new query supersedes the previous one (stale results are not shown).

### In-library detection and linking

- [x] Ownership is resolved by listing the library once (`/library/movies`, `/library/tv-shows`, limit 1000) and matching `tmdbId`/`tvdbId` in memory — no per-result lookup.
- [x] Owned results render an "In Library" badge instead of an Add button, and the whole card becomes a `<Link>` overlay to the detail page (`/media/movies/:id` for movies, `/media/tv/:id` for TV) using the resolved local id.
- [x] Not-owned cards have no link. The action row sits above the link overlay (`z-10`) so clicking a button never triggers card navigation.

### Add to library

- [x] Not-owned cards show an "Add to Library" button; clicking it disables the button and shows a spinner.
- [x] Movies call `POST /library/movies` with `tmdbId`; TV shows call `POST /library/tv-shows` with `tvdbId`. The server fetches full metadata — the client sends only the external id.
- [x] Add is idempotent: re-adding an existing item returns success with no duplicate row; the card simply shows the badge.
- [x] On success the button transitions to the "In Library" badge and a toast confirms; on failure the button reverts and an error toast shows the reason.
- [x] Multiple adds can run concurrently (per-key `addingIds`/`addedIds` sets); the "In Library" state holds for the rest of the session.

### Watchlist and watched actions

- [x] Not-owned movie cards expose compound "Watchlist + Library" and "Watched + Library" buttons: each calls `POST /library/movies` first, then `POST /watchlist` (resp. `POST /watch-history`) with the local id returned by the add. Both are disabled while the add is pending.
- [x] The local id returned by a compound add is cached in session state (`sessionMovieLocalIds: Map<tmdbId, localId>`) so a follow-up action in the same session has the id without a library refetch.
- [x] Owned items (movie and TV) render a `WatchlistToggle` when the local `mediaId` is known.
- [x] Owned movies additionally render a "Mark Watched" button that calls `POST /watch-history` directly. TV shows do not — episode-level watch logging lives on the TV detail page; TV cards have no compound watchlist/watched buttons.

## Edge cases

- [x] Empty query (length 0): no calls, prompt shown.
- [x] One provider fails: that section shows its error + Retry; the other renders normally.
- [x] Results in one section only: the empty section renders nothing and no "No results" message shows (that message only appears when both sections settle empty).
- [x] Rapid typing: debounce plus query-key scoping means only the latest query's results render.
- [x] Item added while results are still on screen: the button swaps to the badge in place, no reload.

## Out of scope

- Full metadata, season/episode views (Movie Detail / TV Show Detail PRDs).
- Editing or removing library items.
- Advanced filters (genre, year range), trending/recommended results (Discovery).
