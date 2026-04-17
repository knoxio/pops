# PRD-039: Plex Sync

> Epic: [06 — Plex Sync](../../epics/06-plex-sync.md)
> Status: Done

## Overview

Build polling-based sync with Plex Media Server. Import library items and watch history into POPS. Plex is one input source — POPS owns the library. Use PIN-based OAuth for authentication so users never enter their Plex password directly.

## Routes

| Route         | Page          |
| ------------- | ------------- |
| `/media/plex` | Plex Settings |

## UI Components

### Plex Settings Page

| Section          | Content                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Connection       | Server URL input, "Test Connection" button, connection status indicator |
| Authentication   | Auth status (connected/disconnected), connect/disconnect buttons        |
| Library Sections | Checkboxes for movie and TV sections to sync                            |
| Sync Controls    | Manual sync button, scheduler toggle with interval input                |
| Sync Status      | Last sync time, items synced/skipped/errors from most recent run        |

### Connection Section

| Element                | Detail                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| Server URL input       | Text field for Plex server URL (e.g., `http://192.168.1.100:32400`) |
| Test Connection button | Validates URL is reachable and returns Plex server info             |
| Connection status      | Green check / red X with server name and version on success         |

### Authentication Section

| Element           | Detail                                                    |
| ----------------- | --------------------------------------------------------- |
| Connect button    | Initiates PIN-based OAuth flow                            |
| PIN display       | Shows PIN code and link to plex.tv/link                   |
| Polling indicator | Spinner while waiting for user to authenticate at plex.tv |
| Auth status       | "Connected as {username}" or "Not connected"              |
| Disconnect button | Removes stored token, shows "Not connected"               |

### Sync Controls

| Element            | Detail                                                |
| ------------------ | ----------------------------------------------------- |
| Manual sync button | Triggers immediate sync of selected sections          |
| Sync progress      | Progress bar or count during active sync              |
| Scheduler toggle   | On/off switch for automatic periodic sync             |
| Interval input     | Numeric input for sync interval in hours (default: 6) |
| Scheduler status   | "Next sync in X hours" or "Scheduler off"             |

### Sync Status

| Element        | Detail                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Last sync time | Relative time ("2 hours ago") with full timestamp on hover                                                     |
| Results        | Synced: N, Skipped: N, Errors: N                                                                               |
| Skip details   | Expandable list of skipped items with title and reason (e.g., "Breaking Bad — no TheTVDB ID in Plex metadata") |
| Error details  | Expandable list of error messages if errors > 0                                                                |

## API Dependencies

| Procedure                        | Usage                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| `media.plex.getAuthPin`          | Generate a PIN code and client ID for Plex OAuth                           |
| `media.plex.checkAuthPin`        | Poll for PIN authentication completion, save token                         |
| `media.plex.disconnect`          | Remove stored Plex auth token                                              |
| `media.plex.testConnection`      | Validate server URL and return server info                                 |
| `media.plex.getSections`         | List library sections from the Plex server                                 |
| `media.plex.syncMovies`          | Sync movies from a Plex library section                                    |
| `media.plex.syncTvShows`         | Sync TV shows from a Plex library section                                  |
| `media.plex.syncWatchHistory`    | Re-sync watch history for already-imported media with detailed diagnostics |
| `media.plex.syncDiscoverWatches` | Sync watch state from Plex Discover cloud for all library items            |
| `media.plex.startScheduler`      | Start periodic sync with configured interval                               |
| `media.plex.stopScheduler`       | Stop periodic sync                                                         |
| `media.plex.getSchedulerStatus`  | Get scheduler state (running, interval, next run time)                     |

## Authentication Flow

### PIN-Based OAuth

1. Client calls `media.plex.getAuthPin()` — server requests a PIN from Plex API, returns `{ id, code, clientId }`
2. UI displays the PIN code and a link to `https://plex.tv/link`
3. User navigates to plex.tv/link on any device, enters the PIN code
4. Client polls `media.plex.checkAuthPin(id)` every 2 seconds
5. When Plex confirms authentication, the server receives an auth token
6. Token is stored in the POPS settings table (encrypted at rest)
7. UI updates to show "Connected as {username}"

### Disconnect

1. Client calls `media.plex.disconnect()`
2. Server deletes the stored token from the settings table
3. UI updates to show "Not connected"

## Sync Operations

### Movie Sync (`syncMovies`)

1. Fetch all movies from the specified Plex library section
2. For each Plex movie, extract the TMDB ID from Plex's external ID metadata
3. Match against POPS library by TMDB ID
4. If no match: create a new movie record using Plex metadata + TMDB enrichment
5. If match exists: skip (idempotent)
6. Sync watch status: if Plex marks it as watched, log a watch event with `source="plex_sync"`
7. Return `{ synced: N, skipped: N, errors: N }`

### TV Show Sync (`syncTvShows`)

1. Fetch all TV shows from the specified Plex library section
2. For each Plex show, extract the TheTVDB ID from Plex's external ID metadata
3. Match against POPS library by TheTVDB ID
4. If no match: create show, seasons, and episodes using Plex metadata
5. If match exists: check for new seasons/episodes and add them
6. Sync watch status at episode level: Plex watched episodes → watch events with `source="plex_sync"`
7. Return `{ synced: N, skipped: N, errors: N }`

### Watch History Sync

- Watch events from Plex sync use `source="plex_sync"` to distinguish from manual watches
- `source="plex_sync"` skips watchlist auto-removal (preserves the user's manual watchlist intent)
- Unique constraint on (mediaType, mediaId, watchedAt) prevents duplicate watch entries across syncs
- Repeated syncs are safe — idempotent by design

### Watch History Re-sync (`syncWatchHistory`)

Standalone re-sync for already-imported media. Returns detailed per-show diagnostics:

- Episodes matched vs season/episode not found (with preview of missing items)
- Gap detection: compares total tracked (new + already logged) against Plex viewedLeafCount
- Movies: counts watched, logged, already logged, not in library

### Plex Discover Cloud Watch Sync (`syncDiscoverWatches`)

Checks all POPS library items against the Plex Discover cloud API (`metadata.provider.plex.tv`). Catches watches from streaming services (Netflix, Disney+, etc.) and other Plex servers — not just the local library.

- One-time backfill: searches Discover by title, matches by TMDB/TVDB ID, checks `userState`
- Auto-check on add: when a movie is added to the library, automatically checks Plex Discover for watch state
- No ongoing cron needed — the per-item auto-check covers future additions

## Scheduler

| Operation   | Detail                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Start       | `startScheduler(intervalHours)` — begins periodic sync at the specified interval        |
| Stop        | `stopScheduler()` — cancels the periodic timer                                          |
| Status      | `getSchedulerStatus()` — returns `{ running, intervalHours, nextRunAt, lastRunAt }`     |
| Execution   | Each tick syncs all selected sections, logs results                                     |
| Persistence | Scheduler state stored in settings table; restarts on server boot if previously enabled |

## Business Rules

- POPS owns the library — Plex is one input source, not the source of truth
- Sync is additive only — Plex sync never deletes items from the POPS library
- TMDB ID is the match key for movies; TheTVDB ID is the match key for TV shows
- If a Plex item has no external ID, it is skipped with a descriptive reason (title + why it was skipped)
- Auth token is stored in the settings table, not in environment variables or config files
- Scheduler is optional — manual sync is always available
- Sync results are stored for the most recent run only (not historical)

## Edge Cases

| Case                                   | Behaviour                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Plex server unreachable                | Test connection fails with error message; sync operations fail gracefully                           |
| Plex item missing TMDB/TheTVDB ID      | Skipped with reason recorded (title + "no TheTVDB ID in Plex metadata"), visible in skip details UI |
| Auth token expired                     | Sync fails with auth error; UI prompts to reconnect                                                 |
| Sync interrupted mid-run               | Partial results committed (each item is its own transaction); re-sync is safe                       |
| Duplicate movie in Plex (two copies)   | Both map to same TMDB ID — second is skipped (unique constraint)                                    |
| Plex show with missing episodes        | Available episodes synced; missing ones ignored                                                     |
| Scheduler running when server restarts | Scheduler re-reads config on boot and restarts if previously enabled                                |
| PIN expires before user authenticates  | `checkAuthPin` returns expired status; UI shows "PIN expired, try again"                            |

## User Stories

| #   | Story                                                   | Summary                                                                                             | Status | Parallelisable   |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-plex-auth](us-01-plex-auth.md)                   | PIN-based OAuth flow (getAuthPin, checkAuthPin, disconnect), token storage in settings table        | Done   | Yes              |
| 02  | [us-02-plex-settings](us-02-plex-settings.md)           | Settings page with URL input, connection test, section selector, sync controls, status display      | Done   | Blocked by us-01 |
| 03  | [us-03-library-sync](us-03-library-sync.md)             | Movie and TV show sync from Plex sections (match by TMDB/TheTVDB ID, add new, report results)       | Done   | Blocked by us-01 |
| 04  | [us-04-watch-history-sync](us-04-watch-history-sync.md) | Watch status sync with source="plex_sync", skip watchlist auto-removal, scheduler for periodic sync | Done   | Blocked by us-03 |

US-01 is the foundation (auth required for all Plex API calls). US-02 and US-03 both depend on US-01 but can run in parallel with each other. US-04 depends on US-03 (needs library sync to have items to sync watch status for).

## Verification

- PIN-based auth flow completes successfully
- Token is stored and survives server restart
- Test connection validates server URL
- Library sections are listed from Plex
- Movie sync matches by TMDB ID and creates new records
- TV show sync matches by TheTVDB ID and creates show/season/episode hierarchy
- Watch history synced with source="plex_sync"
- Plex sync watch events do not trigger watchlist auto-removal
- Manual sync button triggers immediate sync with result display
- Scheduler runs at configured interval
- Repeated syncs are idempotent

## Out of Scope

- Plex webhooks (requires Plex Pass subscription)
- Continue watching / in-progress tracking from Plex
- Plex user rating import
- Bidirectional watchlist sync with Plex Discover (see [PRD-059](../059-plex-watchlist-sync/README.md))
- Multi-user Plex support (single user only)

## Drift Check

last checked: 2026-04-17
