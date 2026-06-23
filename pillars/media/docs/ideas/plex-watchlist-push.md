# Idea: POPS → Plex watchlist push + sync status panel

Status: not built. The pull half (Plex → POPS) ships; the push half and the rich
sync-status UI do not.

Today, adding or removing a row via the watchlist CRUD routes (`POST /watchlist`,
`DELETE /watchlist/:id`) writes only the local SQLite table. There is no call to
the Plex Discover `actions/*` endpoints, the contract `POST /watchlist` body
accepts neither `source` nor `plexRatingKey`, and the `setPlexRatingKey` /
`removeByMedia` service helpers in `db/services/watchlist.ts` are defined but
never called — leftover scaffolding for this feature. The only UI affordance is
a single "Sync with Plex" header button that fires the pull job.

## What to build

### Inline POPS → Plex push

When Plex is connected, mirror local watchlist mutations to the Plex cloud so
both sides stay in sync without waiting for the next pull:

- `POST /watchlist` (add): resolve the item's discover ratingKey (look it up by
  TMDB/TVDB id against Plex Discover, or reuse a stored `plex_rating_key`) and
  call `PUT https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey={key}`.
  Persist the resolved key via `setPlexRatingKey`. New UI-originated entries keep
  `source='manual'`; the next pull escalates them to `'both'` if Plex echoes them.
- `DELETE /watchlist/:id` (remove): if the row has a `plex_rating_key`, call
  `PUT .../actions/removeFromWatchlist?ratingKey={key}`.
- Extend the `POST /watchlist` contract body to accept optional `source` and
  `plexRatingKey` (so the pull and future callers can seed origin explicitly).

Best-effort semantics, non-negotiable:

- The Plex call is wrapped in try/catch — a Plex failure (rate limit, network,
  disconnected) must NOT roll back or block the local mutation. Log and continue;
  the next pull reconciles.
- Missing `plex_rating_key` on remove (item never seen from Plex) → skip the Plex
  call with a warning, local delete still succeeds.
- Plex disconnected → both push calls are no-ops.

Both requests use the same `X-Plex-Token` + `X-Plex-Client-Identifier` as the pull.

### Conflict resolution this enables

| Scenario                       | Behaviour                                  |
| ------------------------------ | ------------------------------------------ |
| Added in POPS, removed in Plex | Pull removes from POPS (Plex removal wins) |
| Added in Plex, removed in POPS | Push removes from Plex (POPS removal wins) |
| Added in both independently    | Keep in both; pull sets `source='both'`    |

### Rich sync-status panel

Replace (or augment) the bare header button with a status section, ideally on a
Plex settings surface:

- Last sync timestamp, plus items added / removed from the last `plexSyncWatchlist`
  run (read from `GET /plex/sync/last`).
- "Sync Watchlist" button with a loading state; results (added / removed / skipped
  / errors) update on completion.
- Expandable error/skip detail, mirroring the library-sync panel pattern.
- Section hidden when Plex is not connected.

## Acceptance

- Adding via `POST /watchlist` while connected fires `addToWatchlist` and stores
  the ratingKey; a Plex error does not fail the local add.
- Removing via `DELETE /watchlist/:id` fires `removeFromWatchlist` when a
  `plex_rating_key` is present; missing key skips the call with a warning.
- `POST /watchlist` body accepts `source` and `plexRatingKey`.
- Settings panel shows last-sync timestamp + added/removed counts, expandable
  errors, and is hidden when disconnected.
- Tests: add pushes to Plex, remove pushes to Plex, Plex failure does not block
  the local op, missing ratingKey skips the push, panel visibility tracks
  connection state.
