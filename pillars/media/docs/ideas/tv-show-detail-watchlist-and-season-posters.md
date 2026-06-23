# Idea: watchlist toggle on the show page + season poster thumbnails

Status: not built. The original TV show detail scope called for both; neither shipped on the show detail page. The supporting REST surface already exists.

## Watchlist toggle on the show detail page

The show detail hero/actions have no watchlist control. The movie detail page already
has a `WatchlistToggle`-style affordance, and the media pillar exposes the full
watchlist surface:

- `GET /watchlist/status?mediaType=tv_show&mediaId=:id` → `{ onWatchlist, entryId }`
- `POST /watchlist` with `{ mediaType:'tv_show', mediaId }`
- `DELETE /watchlist/:id`

Build: add a toggle to `TvShowHero` (or the actions block) that reads status on load
and adds/removes the show, optimistically. Acceptance: on a show not on the watchlist,
the toggle reads "add", clicking it issues `POST /watchlist` and flips to "remove";
clicking again issues `DELETE /watchlist/:id`; the state survives a refetch.

## Per-season poster thumbnails in the season list

`SeasonsList` currently renders each season as a text row (label, episode count,
progress, monitor switch). The season wire shape already carries `posterUrl`, and the
parent show carries its own `posterUrl` for fallback — but neither is rendered.

Build: render a small season poster (2:3) at the start of each season row, falling
back to the show poster when the season has none, then to a muted placeholder block.
Acceptance: a season with a `posterUrl` shows its own thumbnail; a season without one
shows the show poster; a show with no poster either shows a placeholder block.
