# Watchlist

> Status: Done

A prioritised list of movies and TV shows to watch next. Items are reordered by priority (drag-and-drop on desktop, up/down buttons on mobile) and auto-removed when watched via manual actions — never via Plex sync, which preserves the user's manual intent. Add/remove entry points live on the movie/TV detail pages; this PRD owns the watchlist page and the auto-removal rule.

## Data model

`watchlist` table (media pillar SQLite):

- `id` — autoincrement PK
- `mediaType` — `movie | tv_show`
- `mediaId` — id into `movies` / `tv_shows`
- `priority` — integer, default `0` (lower = higher in list)
- `notes` — nullable free text
- `addedAt` — ISO timestamp, default `datetime('now')`
- `source` — text, default `manual` (`plex` for entries pulled from Plex Discover, `both` when present on both sides; downgraded back to `manual` when dropped from the Plex watchlist)
- `plexRatingKey` — nullable, best-effort Plex Discover mapping
- Unique index on `(mediaType, mediaId)` — at most one entry per item

The contract entry shape carries `title` and `posterUrl`, but the list/get handlers serve them as `null` (the `movies` / `tv_shows` join is not done server-side). The watchlist page resolves title / year / poster client-side by fetching the movies and tv-shows lists and keying by `mediaId`. Posters render through the `/media/images/:mediaType/:id/:filename` byte route (Express static/proxy over `MEDIA_IMAGES_DIR`), which is not part of the ts-rest contract.

## REST API surface

Base path `/media` (ts-rest, zod-validated):

- `GET /watchlist` — list entries; optional `mediaType` filter, `limit`/`offset` pagination; ordered by `priority` ASC then `addedAt` DESC
- `GET /watchlist/status?mediaType&mediaId` — `{ onWatchlist, entryId }` for a media item
- `GET /watchlist/:id` — single entry (404 if absent)
- `POST /watchlist` — add `{ mediaType, mediaId, priority?, notes? }`; idempotent on `(mediaType, mediaId)`, returns `created` flag
- `POST /watchlist/reorder` — body `{ items: [{ id, priority }] }`; batch priority rewrite in one transaction
- `PATCH /watchlist/:id` — update `priority` / `notes`
- `DELETE /watchlist/:id` — remove an entry
- `POST /watch-history` — log a watch event `{ mediaType: movie|episode, mediaId, completed?, source? }`; the response carries `watchlistRemoved`, and the auto-removal runs in the same transaction as the insert

Watchlist → Plex Discover push is a background job (`plexSyncWatchlist`), triggered from the page header; on completion the list query is invalidated.

## Business rules

- Order is `priority` ASC, then `addedAt` DESC (newest first within equal priority).
- Reorder sends the full ordered `{ id, priority }` list; the server writes priorities exactly as received inside a single transaction (no partial apply). Duplicate priorities in one request are rejected (409 conflict); a missing id is 404.
- Add is idempotent — re-adding an existing item returns the existing row with `created=false`.
- Auto-removal (manual watch only, `completed=1`, `source !== 'plex_sync'`):
  - **Movie** — removed immediately on watch.
  - **TV show** — removed only when every episode across all seasons has a completed watch; stays otherwise.
  - After a removal, remaining priorities are re-sequenced (0,1,2,…) to eliminate gaps.
- `source="plex_sync"` watch events never trigger auto-removal.
- Auto-removal is a one-way consequence: undoing a mark-as-watched deletes the watch event but does **not** re-add the item (avoids cross-table state reversal).
- Removing an item that is not on the watchlist is a no-op, not an error.

## UI

Page at `/media/watchlist`, max-width single column.

- **Desktop (md+)** — responsive poster-card grid (`md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`) with a sequential priority badge per card; drag-and-drop reorder via `@dnd-kit` (mouse + touch sensors), with a drag overlay and optimistic ordering.
- **Mobile** — compact list rows (poster thumbnail, title, priority number, type badge, year) with up/down reorder buttons.
- **Filter tabs** — All / Movies / TV Shows, reflected in the `?type=` query param, switching content without a full reload.
- **Notes** — shown inline below each item (clamped to 2 lines), click to edit inline (textarea, 500-char cap, Ctrl+Enter to save).
- **Year line** — shown when available.
- **Empty state** — "Your watchlist is empty…" with links to library and search; filter-specific copy ("No movies on your watchlist" / "No TV shows on your watchlist").
- **Loading** — skeleton matching the active layout.
- Reorder controls are hidden when fewer than 2 items; up disabled on the first row, down on the last; reorder is disabled while a request is in flight.

## Edge cases

- Reorder API failure → revert to previous order, show an error toast.
- Drag cancelled mid-drag (escape / drop outside) → revert without an API call.
- Movie auto-removed on watch → disappears, priority badges re-sequence.
- TV show partially watched → stays until all episodes are completed.
- Plex-sync watch of a movie → entry preserved.
- Undo mark-as-watched after auto-removal → item does not reappear.

## Acceptance criteria

- [x] Page renders at `/media/watchlist`; desktop poster-card grid with numbered priority badges, mobile compact list.
- [x] Filter tabs (All / Movies / TV Shows) drive `?type=` and `GET /watchlist?mediaType=…`; list ordered by priority ASC then addedAt DESC.
- [x] Drag-and-drop reorders on desktop (optimistic); up/down buttons reorder on mobile; both POST the full `{ id, priority }` list to `/watchlist/reorder`, written in one transaction with sequential gap-free priorities.
- [x] Reorder failure reverts order + error toast; cancelled drag reverts with no API call; controls hidden for <2 items; first/last buttons disabled; reorder disabled while in flight.
- [x] Duplicate priorities in a reorder request are rejected; a missing id 404s — the transaction rolls back rather than half-applying.
- [x] Add is idempotent on `(mediaType, mediaId)`; notes are optional and inline-editable after add.
- [x] Notes display below each item, clamped, expandable into an inline editor.
- [x] Movie auto-removes from the watchlist on manual `completed=1` watch; TV show auto-removes only when all episodes are completed, otherwise retained.
- [x] `source="plex_sync"` watch events do not trigger auto-removal; auto-removal and the watch insert share one transaction; priorities re-sequence after removal.
- [x] Undo of a mark-as-watched deletes the watch event but does not re-add to the watchlist; marking an off-list item is a no-op.
- [x] Empty state with library/search links; filter-specific empty copy; skeleton loading matches layout.

## Out of scope

- Add/remove affordances on detail pages (owned by the movie/TV detail PRDs).
- Plex watchlist sync internals (owned by the Plex sync PRD); this page only triggers the job and refreshes.
- Watchlist sharing or export.
