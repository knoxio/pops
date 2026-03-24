# PRD-015: Plex Sync

**Epic:** [06 — Plex Sync](../themes/media/epics/06-plex-sync.md)
**Theme:** Media
**Status:** Approved
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md)

## Problem Statement

The user has a Plex library with hundreds of movies and TV shows, plus watch history accumulated over years. Manually adding each item to POPS and marking it as watched would be tedious and defeat the "output > input" principle. Plex sync imports the existing library and keeps watch status in sync automatically.

## Goal

A polling-based sync service imports movies and TV shows from Plex, matches them to TMDB/TheTVDB, adds them to the POPS library, and syncs watch history at the episode level. Authentication must be handled dynamically via the official Plex PIN flow, and all server configuration must be managed via the UI.

## Requirements

### R1: Plex API Client

Create `apps/pops-api/src/modules/media/plex/`:

```
media/plex/
  client.ts           (HTTP client for Plex API)
  types.ts            (Plex API response types)
  matcher.ts          (match Plex items to TMDB/TheTVDB IDs)
  service.ts          (orchestration — import, sync, scheduling)
  router.ts           (tRPC procedures)
```

**Plex API basics:**
- Authentication: `X-Plex-Token` query parameter
- Client Identification: `X-Plex-Client-Identifier` header (stable UUID per app instance)
- Content type: `Accept: application/json`

### R2: Dynamic Plex Connection

**No environment variables for user settings.**
All connection data must be stored in the `settings` table (PRD-005):
- `plex_url` — Plex server base URL
- `plex_token` — Dynamically obtained authentication token
- `plex_client_identifier` — Stable UUID for this app instance

**tRPC procedures for connection management:**

| Procedure | Type | Description |
|-----------|------|-------------|
| `media.plex.getAuthPin` | mutation | Generate a Plex login PIN and URL |
| `media.plex.checkAuthPin` | mutation | Poll for successful authentication and save token |
| `media.plex.setUrl` | mutation | Validate and save the Plex Server URL |
| `media.plex.testConnection` | query | Verify Plex server is reachable and token is valid |
| `media.plex.getSyncStatus` | query | Return detailed configuration and sync status |
| `media.plex.disconnect` | mutation | Remove the authentication token from database |

**Validation Rules:**
- `setUrl` must perform a reachability test before saving.
- If a token exists, `setUrl` must perform an authenticated request to verify the combination.

### R3: TMDB/TheTVDB Matching

Plex items need to be matched to TMDB (movies) or TheTVDB (TV) IDs for insertion into the POPS library.

**Matching strategy (ordered by reliability):**

1. **Plex agent ID** — Extract ID from `plex://movie/{tmdb_id}` or `com.plexapp.agents.thetvdb://{tvdb_id}`.
2. **External IDs** — Extract from the `Guid` array.
3. **Title + year search** — Fall back to searching metadata providers.

### R4: Initial Library Import

**Steps for import:**
1. Fetch all items from the selected Plex library section.
2. Match to TMDB/TheTVDB.
3. Add to POPS library via existing library services.
4. If watched on Plex, create local `watch_history` entries.

**Idempotency:** Sync must be safe to run repeatedly. A watch event from Plex is uniquely identified by the tuple `(media_type, media_id, watched_at)` — same item with the same Plex timestamp is the same watch event. Repeated syncs must not create duplicate `watch_history` rows.

This is distinct from legitimate re-watches: if Plex reports a different `lastViewedAt` timestamp for the same item, that represents a new watch event and should be inserted.

**Implementation:** Add a unique index on `watch_history(media_type, media_id, watched_at)` and use `INSERT ... ON CONFLICT DO NOTHING` (or check-before-insert) when syncing Plex watch events. This also protects against duplicates from any other code path.

**Watchlist interaction:** Watch events created by Plex sync must **not** trigger auto-removal from the watchlist (PRD-011 R6). Plex sync imports historical data — it should not have the same side effects as the user explicitly marking something as watched. The `logWatch` call from Plex sync should pass a `source` parameter (e.g., `"plex"`) so that the watch history service can skip auto-removal for external sync sources.

### R5: Periodic Watch History Sync

**Scheduler:**
- Automatically polls Plex for new watch events.
- Interval and section IDs managed via scheduler service.
- Can be triggered manually via `media.plex.syncMovies` or `media.plex.syncTvShows`.

**Section ID persistence:** The user's selected movie and TV library section IDs must be persisted in the `settings` table:
- `plex_movie_section_id` — Plex library section ID for movies
- `plex_tv_section_id` — Plex library section ID for TV shows

The scheduler reads from these settings. If not configured, the scheduler must not sync and should log a warning — never fall back to hardcoded defaults. The PlexSettingsPage (R7) saves the selected section IDs when the user triggers a sync or explicitly selects a library.

**Idempotency:** Same requirements as R4 — repeated syncs must not create duplicate watch history entries.

### R6: Bidirectional Watchlist Sync

Sync the POPS watchlist (PRD-011) with the Plex Universal Watchlist. Changes in either system propagate to the other.

**Plex Watchlist API (cloud — not local server):**

The Plex watchlist is a cloud-based feature accessed via `https://discover.provider.plex.tv`, not the local Plex Media Server. All requests use the same `X-Plex-Token` obtained via PIN auth (R2) and `X-Plex-Client-Identifier` header.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List watchlist | GET | `https://discover.provider.plex.tv/library/sections/watchlist/all` |
| Add to watchlist | PUT | `https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey={ratingKey}` |
| Remove from watchlist | PUT | `https://discover.provider.plex.tv/actions/removeFromWatchlist?ratingKey={ratingKey}` |
| Check item state | GET | `https://metadata.provider.plex.tv/library/metadata/{ratingKey}/userState` |

**RatingKey resolution:** Plex watchlist items use a discover `ratingKey` (not the local library `ratingKey`). This is extracted from the item's `guid` field: `guid.rsplit('/', 1)[-1]`. For example, `plex://movie/5d776830880197001ec955e8` yields ratingKey `5d776830880197001ec955e8`.

**Plex → POPS sync:**

1. Fetch all items from the Plex watchlist.
2. For each item, extract TMDB/TVDB ID from the `Guid` array (same matching logic as R3).
3. Check if the item exists in the POPS library. If not, add it via the library service (same as R4).
4. Check if the item is already on the POPS watchlist. If not, add it via `media.watchlist.add`.
5. Items removed from the Plex watchlist since the last sync should be removed from the POPS watchlist — but only if the item was originally added by Plex sync (see conflict resolution below).

**POPS → Plex sync:**

1. When a user adds an item to the POPS watchlist (via the UI), also add it to the Plex watchlist.
2. When a user removes an item from the POPS watchlist (via the UI), also remove it from the Plex watchlist.
3. POPS → Plex sync happens **inline** (at mutation time), not via polling. The `media.watchlist.add` and `media.watchlist.remove` tRPC procedures call the Plex API as a side effect when Plex is connected.
4. Plex API failures must not block the local operation — log the error and continue. The next Plex → POPS poll will reconcile.

**Conflict resolution:**

Track the origin of each watchlist entry to handle conflicts:

| Scenario | Behaviour |
|----------|-----------|
| Added in POPS, removed in Plex | Remove from POPS (Plex removal wins) |
| Added in Plex, removed in POPS | Remove from Plex (POPS removal wins) |
| Added in both independently | Keep in both (no conflict) |
| Removed in both independently | Stay removed (no conflict) |

**Implementation:** Add a `source` column to the `watchlist` table (`"manual"`, `"plex"`, or `"both"`). When an item exists in both systems during a sync, set source to `"both"`. This allows the sync to distinguish "user removed from POPS" (source was `"both"` or `"manual"`, now missing → remove from Plex) from "never synced to POPS" (no source record → add to POPS).

**Sync schedule:** Plex → POPS sync runs as part of the periodic scheduler (R5). POPS → Plex sync is inline (immediate on user action).

**Schema change:**

Add to `watchlist` table:
- `source` — TEXT, enum: `"manual"`, `"plex"`, `"both"`. Default: `"manual"`.
- `plex_rating_key` — TEXT, nullable. The Plex discover `ratingKey` for this item. Required for POPS → Plex removal.

**tRPC procedures:**

| Procedure | Type | Description |
|-----------|------|-------------|
| `media.plex.syncWatchlist` | mutation | Trigger a Plex → POPS watchlist sync |

The scheduler (R5) calls `syncWatchlist` after syncing movies and TV shows.

### R7: Plex Setup & Sync UI

**Location:** `/media/settings/plex`

**Setup Flow:**
1. **URL Entry**: User enters Plex Server URL. "Save" button validates reachability.
2. **Authentication**: "Connect to Plex" button opens official Plex sign-in.
3. **Polling**: UI polls `checkAuthPin` until connected.
4. **Library Selection**: Once connected, user selects libraries to sync.

**Display:**
- Status badges: "Connected", "Unconfigured", "Missing URL".
- Detailed error messages for failed connections.
- Last sync results per media type (movies, TV shows, watchlist).
- Watchlist sync status: last sync timestamp, items synced/removed.

## Acceptance Criteria

1. Plex client connects using dynamic credentials from the database.
2. The 4-step PIN authentication flow is implemented and functional.
3. Server URL can be set and updated via the UI with mandatory validation.
4. Library discovery works only after successful authentication.
5. Watch history import uses Plex timestamps.
6. Periodic sync picks up new activity automatically.
7. Disconnecting Plex clears the token from the database.
8. Repeated syncs do not create duplicate `watch_history` rows for the same watch event.
9. Plex-sourced watch events do not trigger auto-removal from the watchlist.
10. Selected library section IDs are persisted in the `settings` table and used by the scheduler.
11. Scheduler does not sync if section IDs are not configured (no hardcoded fallbacks).
12. Items added to the Plex watchlist appear in the POPS watchlist after sync.
13. Items added to the POPS watchlist are pushed to the Plex watchlist immediately (when connected).
14. Removing an item from either watchlist removes it from the other on next sync or inline.
15. Plex API failures during watchlist push do not block local operations.
16. Watchlist entries track their source (`manual`, `plex`, `both`) for conflict resolution.
17. `pnpm typecheck` and `pnpm test` pass.
18. No Plex secrets exist in `.env`.
