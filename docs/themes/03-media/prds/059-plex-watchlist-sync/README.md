# PRD-059: Plex Watchlist Sync

> Epic: [06 — Plex Sync](../../epics/06-plex-sync.md)
> Status: Done

## Overview

Sync the POPS watchlist (PRD-036) with the Plex Universal Watchlist. Changes in either system propagate to the other. Plex → POPS runs on the sync scheduler, POPS → Plex runs inline on user actions.

The Plex watchlist is a **cloud-based feature** accessed via `https://discover.provider.plex.tv`, not the local Plex Media Server. It uses the same auth token obtained via PIN auth (PRD-039 US-01).

## Plex Watchlist API

| Operation             | Method | Endpoint                                                                              |
| --------------------- | ------ | ------------------------------------------------------------------------------------- |
| List watchlist        | GET    | `https://discover.provider.plex.tv/library/sections/watchlist/all`                    |
| Add to watchlist      | PUT    | `https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey={ratingKey}`      |
| Remove from watchlist | PUT    | `https://discover.provider.plex.tv/actions/removeFromWatchlist?ratingKey={ratingKey}` |
| Check item state      | GET    | `https://metadata.provider.plex.tv/library/metadata/{ratingKey}/userState`            |

All requests use `X-Plex-Token` and `X-Plex-Client-Identifier` headers (same as library sync).

### RatingKey Resolution

Plex watchlist items use a **discover ratingKey** (not the local library ratingKey). Extracted from the item's `guid` field: `plex://movie/5d776830880197001ec955e8` → ratingKey `5d776830880197001ec955e8`.

## Sync Directions

### Plex → POPS (polling)

1. Fetch all items from the Plex cloud watchlist
2. For each item, extract TMDB/TheTVDB ID from the `Guid` array (same matching as PRD-039 US-03)
3. If the item is not in the POPS library, add it (same flow as library sync)
4. If the item is not on the POPS watchlist, add it via `media.watchlist.add` with `source="plex"`
5. Items removed from Plex watchlist since last sync: remove from POPS watchlist **only if** the source is `"plex"` (not `"manual"` or `"both"`)

### POPS → Plex (inline)

1. When a user adds an item to the POPS watchlist via the UI, also add it to the Plex watchlist
2. When a user removes an item from the POPS watchlist via the UI, also remove it from the Plex watchlist
3. Runs **inline** at mutation time, not via polling
4. Plex API failures must not block the local operation — log the error, continue. Next poll reconciles

## Schema Changes

Add to `media_watchlist` table:

| Column        | Type | Constraints      | Description                                                |
| ------------- | ---- | ---------------- | ---------------------------------------------------------- |
| source        | TEXT | DEFAULT 'manual' | Origin: `"manual"`, `"plex"`, or `"both"`                  |
| plexRatingKey | TEXT | nullable         | Plex discover ratingKey — required for POPS → Plex removal |

## Conflict Resolution

| Scenario                       | Behaviour                            |
| ------------------------------ | ------------------------------------ |
| Added in POPS, removed in Plex | Remove from POPS (Plex removal wins) |
| Added in Plex, removed in POPS | Remove from Plex (POPS removal wins) |
| Added in both independently    | Keep in both, set source to `"both"` |
| Removed in both independently  | Stay removed (no conflict)           |

The `source` column tracks origin so the sync can distinguish "user removed from POPS" (source was `"both"` or `"manual"`) from "never synced to POPS" (no record).

## API Surface

| Procedure                  | Type     | Input  | Description                        |
| -------------------------- | -------- | ------ | ---------------------------------- |
| `media.plex.syncWatchlist` | mutation | (none) | Trigger Plex → POPS watchlist sync |

The scheduler (PRD-039 US-04) calls `syncWatchlist` after syncing movies and TV shows.

`media.watchlist.add` and `media.watchlist.remove` (PRD-036) are extended to call Plex API as a side effect when Plex is connected.

## Business Rules

- Plex watchlist is cloud-based (`discover.provider.plex.tv`), not local server
- Plex → POPS sync is additive by default — only removes items sourced from Plex
- POPS → Plex sync is inline and best-effort — failures don't block local operations
- The `source` column ensures we never remove a manually-added item because Plex doesn't have it
- Items that exist in both systems have `source="both"` — either side can remove them
- Sync runs after library + watch history sync in the scheduler sequence
- `plexRatingKey` is required for POPS → Plex removal — if missing, skip the Plex API call

## Edge Cases

| Case                                             | Behaviour                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Item on Plex watchlist but not in POPS library   | Add to library first (same as library sync), then add to watchlist |
| Item on POPS watchlist with no TMDB/TheTVDB ID   | Cannot sync to Plex — skip with warning                            |
| Plex API rate limit during inline push           | Log error, local operation succeeds, next poll reconciles          |
| Plex disconnected                                | POPS → Plex calls are no-ops; Plex → POPS sync skipped             |
| Same item added in both systems independently    | Set source to `"both"` during next Plex → POPS sync                |
| User removes from POPS, item was source="plex"   | Remove locally, also remove from Plex                              |
| User removes from POPS, item was source="manual" | Remove locally, also remove from Plex (user intent is clear)       |

## User Stories

| #   | Story                                                           | Summary                                                                                      | Status | Parallelisable   |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-schema-source-tracking](us-01-schema-source-tracking.md) | Add `source` and `plexRatingKey` columns to watchlist table, migrate existing data           | Done   | No (first)       |
| 02  | [us-02-plex-to-pops-sync](us-02-plex-to-pops-sync.md)           | Plex → POPS polling sync: fetch cloud watchlist, match IDs, add/remove with source tracking  | Done   | Blocked by us-01 |
| 03  | [us-03-pops-to-plex-push](us-03-pops-to-plex-push.md)           | POPS → Plex inline push: extend watchlist add/remove to call Plex API when connected         | Done   | Blocked by us-01 |
| 04  | [us-04-sync-ui](us-04-sync-ui.md)                               | Watchlist sync status on Plex settings page: last sync, items synced/removed, manual trigger | Done   | Blocked by us-02 |

US-02 and US-03 can parallelise after US-01.

## Verification

- Adding a movie to the Plex watchlist → appears in POPS watchlist after sync
- Adding a movie to the POPS watchlist → appears in Plex watchlist immediately
- Removing from either side → removed from the other
- Source tracking prevents removing manually-added items
- Plex API failures don't break local operations
- Sync is idempotent — repeated runs produce same state

## Out of Scope

- Real-time sync via Plex webhooks (polling is sufficient)
- Watchlist priority sync (Plex has no priority concept)
- Syncing watchlist notes or metadata beyond the item reference

## Drift Check

last checked: 2026-04-17
