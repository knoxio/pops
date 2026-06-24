# Library Page

> Status: Done

The media library — a responsive poster grid of every owned movie and TV show, the default `/media` route. Filter by type and genre, sort, search by title, and paginate. Renders at the index route in `pillars/media/app/src/routes.tsx` (`LibraryPage`).

## Data source

The grid is backed by the `library.*` REST contract (`pillars/media/src/contract/rest-library.ts`), served by the media pillar. Cross-pillar callers reach it through the `@pops/pillar-sdk` `pillar()` client; the app uses generated clients via `useMediaLibrary`.

### `LibraryItem` wire shape

`{ id, type: 'movie' | 'tv', title, year, posterUrl, cdnPosterUrl, genres[], voteAverage, createdAt, releaseDate }`

Movies and TV shows are unioned into one paginated grid server-side (`UNION ALL` over `movies` + `tv_shows`), so a single page can mix both types.

### Poster bytes

`posterUrl` / `cdnPosterUrl` resolve to the pillar's `/media/images/<type>/<externalId>/poster.jpg` byte route. That route serves `MEDIA_IMAGES_DIR` directly (Express static/proxy with on-demand download fallback) and is intentionally NOT part of the ts-rest contract — it returns image bytes, not JSON.

## REST API surface

| Endpoint              | Purpose                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /library`        | Paginated library grid. Query: `type` (`all`/`movie`/`tv`, default `all`), `sort` (`title`/`dateAdded`/`releaseDate`/`rating`, default `title`), `search`, `genre`, `page` (default 1), `pageSize` (≤96, default 24). Returns `{ data: LibraryItem[], pagination: { page, pageSize, total, totalPages, hasMore } }`. |
| `GET /library/genres` | Distinct genres across movies + TV, case-insensitively sorted, for the genre filter.                                                                                                                                                                                                                                 |

(The `library/quick-pick`, `POST /library/movies`, `POST /library/tv-shows`, and the refresh `PATCH` routes also live in this contract but belong to other PRDs — quick pick and ingestion.)

## Business rules

- Library is the default media route; `/media` index renders the grid.
- Filter/sort/search/genre/page state lives in URL query params, so the page is bookmarkable and back/forward works. Param names: `?type=`, `?sort=`, `?genre=`, `?q=`, `?page=`, `?pageSize=`. (The wire query field is `search`; the URL key is `q`.)
- Filtering, sorting, search (`title LIKE %q%`), and genre membership (`json_each` over the stored genres array) are all server-side. Changing any of `type`/`sort`/`genre`/`q`/`pageSize` resets `page` to 1.
- Type badge on a card is shown only when the type filter is "All" (redundant when already filtered to one type).
- Poster cascade per card: `cdnPosterUrl` (cached/CDN) → `posterUrl` → generic `Film` placeholder icon. Each tier is tried in turn on image-load error.
- Empty-library state (zero items, no active search/type/genre filter) differs from no-results state (filters/search matched nothing).

## UI

- **MediaCard** (`components/MediaCard.tsx`): 2:3 poster, 2-line truncated title, year below in muted text, optional type badge (`showTypeBadge` prop). Whole card is a `Link` to `/media/movies/:id` or `/media/tv/:id`. Hover/focus state via group opacity + focus ring. Optional watch-progress bar overlay for TV.
- **Grid** (`components/MediaGrid.tsx`): responsive 2 → 3 (sm) → 4 (md) → 5 (lg) → 6 (xl) columns.
- **Filters** (`pages/library/LibraryFilters.tsx`): type toggle group (All / Movies / TV Shows), genre select (only when genres exist), sort select, debounced (300ms) title search input with clear.
- **Pagination** (`pages/library/PaginationControls.tsx`): page-size select (24/48/96), prev/next buttons, "N items · Page X of Y" info. Hidden when zero items.
- **States** (`pages/library/LibraryContent.tsx` + `LibrarySkeleton.tsx`): loading → shimmer skeleton grid sized to the current page size; error → message + Retry (re-fetch); empty library → CTA link to `/media/search`; no-results → "No results for [q]" + Clear search.

## Acceptance criteria

- [x] `/media` renders the library grid as the default route.
- [x] Grid is 2/3/4/5/6 columns at mobile/sm/md/lg/xl.
- [x] Type filter (All / Movies / TV) drives `?type=` and server-side filtering; badge hidden unless "All".
- [x] Sort select (Title A-Z default, Date Added, Release Date, Rating) drives `?sort=` and server-side ordering.
- [x] Genre select (populated from `GET /library/genres`) drives `?genre=` and server-side `json_each` membership filtering.
- [x] Title search drives `?q=` (debounced 300ms), server-side `LIKE` filter; changing it resets to page 1.
- [x] All filter/sort/search/page state persisted in URL query params; grid re-fetches on any change.
- [x] Pagination: page-size selector (24/48/96), prev/next with correct disabled bounds, current/total page display.
- [x] MediaCard: poster cascade (`cdnPosterUrl` → `posterUrl` → placeholder), 2-line title truncation, year, 2:3 aspect, card-wide navigation to the correct detail URL per type.
- [x] Empty-library state shows a CTA to `/media/search`; no-results state shows "No results for [q]" + Clear search.
- [x] Loading renders a shimmer skeleton grid matching the current page size; error renders a Retry button that re-fetches and never leaks a stack trace.
- [x] `MediaCard.test.tsx` covers per-type navigation URL, badge visibility (default + `showTypeBadge=false`), the poster cascade (primary → fallback on error → placeholder), and year rendering/truncation; `LibraryPage.test.tsx` covers the loading skeleton sized to `pageSize`, the error view (Retry re-fetches, no stack-trace leak), the empty-library and no-results / generic-filter views, and the populated grid.

## Out of scope

- Adding items to the library (search/ingestion PRD).
- Movie / TV detail views.
- Watch-status indicators and comparison scores on cards (tracking / ratings PRDs).
