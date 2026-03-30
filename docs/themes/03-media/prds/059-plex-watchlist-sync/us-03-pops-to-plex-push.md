# US-03: POPS → Plex inline watchlist push

> PRD: [059 — Plex Watchlist Sync](README.md)
> Status: Not started

## Description

As a user, I want items I add or remove from my POPS watchlist to sync to Plex immediately so that both systems stay in sync without waiting for a poll.

## Acceptance Criteria

- [ ] `media.watchlist.add` checks if Plex is connected; if so, calls Plex `addToWatchlist` API with the item's ratingKey
- [ ] `media.watchlist.remove` checks if Plex is connected; if so, calls Plex `removeFromWatchlist` API with the stored `plexRatingKey`
- [ ] RatingKey resolved by matching TMDB/TheTVDB ID to Plex discover metadata (or stored `plexRatingKey` from prior sync)
- [ ] Plex API failures do not block the local add/remove operation — error logged, local mutation succeeds
- [ ] If `plexRatingKey` is not available (item never synced from Plex), skip the Plex API call with a warning
- [ ] New watchlist entries from UI get `source="manual"` (default)
- [ ] Items added to both POPS and Plex independently get `source="both"` on next Plex → POPS sync
- [ ] Tests cover: add pushes to Plex, remove pushes to Plex, Plex API failure doesn't block local operation, missing ratingKey skips push

## Notes

This is inline (at mutation time), not polling. The `media.watchlist.add` and `media.watchlist.remove` tRPC procedures get Plex side effects added. Keep the Plex call in a try/catch — the local operation must always succeed regardless of Plex availability.
