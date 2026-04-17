# PRD-070: Rotation Engine

> Epic: [Library Rotation](../../epics/08-library-rotation.md)

## Overview

The rotation engine is a daily automated job that manages the movie library lifecycle. Disk space is the primary driver: the system removes enough old movies to stay below a target free-space threshold, then adds new movies from the candidate queue if space permits. Removals go through a "leaving soon" grace period before files are actually deleted via Radarr. The number of movies removed or added on any given day is variable — entirely determined by disk usage.

## Data Model

### `rotation_config` (settings table keys)

| Key                        | Type    | Default     | Description                                                                                                          |
| -------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `rotation_enabled`         | boolean | `false`     | Master switch                                                                                                        |
| `rotation_cron_expression` | string  | `0 3 * * *` | When the daily job runs (cron syntax)                                                                                |
| `rotation_leaving_days`    | integer | `10`        | Days in "leaving" state before removal                                                                               |
| `rotation_target_free_gb`  | integer | `200`       | Target minimum free disk space in GB — the primary driver for removals                                               |
| `rotation_daily_additions` | integer | `2`         | Max movies to add per cycle (gated by disk space)                                                                    |
| `rotation_avg_movie_gb`    | real    | `15`        | Estimated average movie size in GB (used to calculate how many to mark leaving when Radarr `sizeOnDisk` unavailable) |
| `rotation_protected_days`  | integer | `30`        | Days a manually-downloaded movie is protected from rotation                                                          |

### `movies` table additions

| Column                | Type                | Default | Description                                                                                                      |
| --------------------- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `rotation_status`     | text (enum)         | `null`  | `null` = normal/eligible, `'leaving'` = marked for removal, `'protected'` = manually added, temporarily shielded |
| `rotation_expires_at` | text (ISO datetime) | `null`  | When `leaving` → eligible for removal, or when `protected` → enters rotation pool                                |
| `rotation_marked_at`  | text (ISO datetime) | `null`  | When the movie was marked as leaving (for UI countdown)                                                          |

### `rotation_log`

| Column                  | Type        | Description                                                             |
| ----------------------- | ----------- | ----------------------------------------------------------------------- |
| `id`                    | integer PK  | Auto-increment                                                          |
| `executed_at`           | text        | ISO datetime of job execution                                           |
| `movies_marked_leaving` | integer     | Count marked leaving this cycle                                         |
| `movies_removed`        | integer     | Count actually removed (expired + deleted)                              |
| `movies_added`          | integer     | Count added from candidate queue                                        |
| `removals_failed`       | integer     | Count of failed Radarr deletions                                        |
| `free_space_gb`         | real        | Disk space at time of execution                                         |
| `target_free_gb`        | real        | Configured target at time of execution                                  |
| `skipped_reason`        | text        | `null` if ran, otherwise reason for skip (e.g., `'radarr_unreachable'`) |
| `details`               | text (JSON) | Movie titles/IDs for each action                                        |

## API Surface

### Internal (used by the cron job, not exposed as tRPC)

- `runRotationCycle()` — orchestrates the full daily cycle
- `getRadarrDiskSpace()` → free space in GB via Radarr `/api/v3/diskspace`
- `getRadarrMovieSizes()` → map of Radarr movie ID → `sizeOnDisk` in GB (from Radarr `/api/v3/movie`)
- `calculateRemovalCount(freeSpaceGb, targetFreeGb, pendingLeavingGb)` → how many additional movies to mark leaving to reach the target, accounting for movies already in the leaving pipeline
- `getEligibleForRemoval()` → all eligible movies ordered by `created_at` ASC, excluding watchlist items, `protected` movies, movies already `leaving`, and movies currently downloading in Radarr. Includes `sizeOnDisk` from Radarr for each.
- `markAsLeaving(movieIds, expiryDate)` — sets `rotation_status = 'leaving'`
- `processExpiredMovies()` — finds `leaving` movies past `rotation_expires_at`, calls Radarr delete with `deleteFiles=true`
- `addFromQueue(count)` — picks from candidate queue (PRD-071), calls Radarr add with `searchForMovie: true`

### tRPC (exposed to UI)

- `rotation.getConfig` — current rotation settings
- `rotation.updateConfig` — update settings (partial)
- `rotation.getStatus` — current state: next run, last run summary, disk space, leaving count
- `rotation.getLeavingSoon` — movies with `rotation_status = 'leaving'`, sorted by `rotation_expires_at`
- `rotation.getLog` — paginated rotation execution history
- `rotation.runNow` — manually trigger a rotation cycle
- `rotation.cancelLeaving(movieId)` — clear leaving status, return to active pool

## Business Rules

- **Disk space drives removals:** The system calculates how much space needs to be freed: `deficit = rotation_target_free_gb - current_free_space_gb - pending_leaving_space_gb`. If `deficit > 0`, it marks the oldest eligible movies as leaving until the cumulative `sizeOnDisk` of newly marked movies covers the deficit. If `deficit ≤ 0`, no new movies are marked leaving this cycle. "Pending leaving space" accounts for movies already in the `leaving` state whose expiry hasn't hit yet — their space will be reclaimed soon, so they count toward the budget.
- **Removal selection order:** Eligible movies are ordered by `created_at` ASC (oldest first). The system walks this list, accumulating `sizeOnDisk`, until the deficit is covered. This is deterministic, not random — the oldest movies go first.
- **Eligibility exclusions:** Movies on the user's watchlist, movies with `rotation_status = 'protected'` (unexpired), movies already `leaving`, and movies currently downloading in Radarr are all excluded from removal selection.
- **Leaving grace period:** Marked movies stay in the library for `rotation_leaving_days` (default 10). During this period they appear in the "Leaving Soon" shelf. After expiry, they are deleted from Radarr with `deleteFiles=true`.
- **Expired movie processing:** Each cycle first processes all expired leaving movies (deletes from Radarr), then recalculates free space, then decides whether to mark more movies as leaving.
- **Watchlist protection:** Any movie on the user's watchlist is permanently ineligible for rotation. If a movie is marked `leaving` and then added to the watchlist, the leaving status is immediately cleared.
- **Manual download protection:** Movies added via the "Download" action (bypassing the queue) get `rotation_status = 'protected'` with `rotation_expires_at` set to `now + rotation_protected_days`. After expiry, status clears to `null` (eligible).
- **Addition gating:** After removals, if free space ≥ `rotation_target_free_gb`, add up to `rotation_daily_additions` movies from the candidate queue. If free space is still below target (not enough expired movies freed space yet), skip additions entirely.
- **Movie size data:** Each movie's `sizeOnDisk` comes from Radarr's `/api/v3/movie` response. If a movie isn't in Radarr (removed externally), fall back to `rotation_avg_movie_gb` as an estimate.
- **No compounding on total failure:** If the entire cycle fails (Radarr unreachable), log the failure and skip. Do not carry over missed removals/additions to the next day.
- **Cycle order:** Process expired deletions → measure free space → mark new leaving movies → measure free space again → add from queue.

## Edge Cases

| Case                                                      | Behaviour                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Deficit requires more removals than eligible movies       | Mark all eligible as leaving, log the shortfall. Remaining deficit carries naturally to next cycle (free space will still be below target) |
| Deficit is 0 or negative (plenty of space)                | Skip marking, no new leaving movies this cycle                                                                                             |
| No candidates in queue for addition                       | Skip additions, log "queue empty"                                                                                                          |
| Radarr unreachable at cycle start                         | Log `skipped_reason = 'radarr_unreachable'`, skip entire cycle                                                                             |
| Movie deleted from Radarr externally                      | Removal succeeds (no-op on Radarr side), clear from POPS                                                                                   |
| Movie marked leaving but re-added to watchlist            | Clear leaving status immediately (watchlist router calls rotation service)                                                                 |
| Disk space endpoint returns multiple disks                | Use the disk where the Radarr root folder lives                                                                                            |
| Rotation disabled mid-cycle                               | Complete current cycle, don't schedule next                                                                                                |
| All movies are watchlisted or protected                   | 0 eligible for removal, log and skip. Additions still proceed if space permits                                                             |
| Single large movie (e.g., 80GB 4K) covers entire deficit  | Mark just that one movie — removal count is driven by bytes, not count                                                                     |
| Radarr `sizeOnDisk` is 0 for a movie (not yet downloaded) | Skip it — no space to reclaim. It will be picked up once it has files                                                                      |

## User Stories

| #   | Story                                                   | Summary                                                                               | Status  | Parallelisable                  |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- | ------------------------------- |
| 01  | [us-01-rotation-schema](us-01-rotation-schema.md)       | Schema migration: new columns on `movies`, `rotation_log` table                       | Done    | Yes                             |
| 02  | [us-02-removal-selection](us-02-removal-selection.md)   | Disk-space-driven removal: deficit calculation, oldest-first selection, Radarr delete | Done    | Blocked by US-01                |
| 03  | [us-03-leaving-lifecycle](us-03-leaving-lifecycle.md)   | Leaving state machine: mark, expire, watchlist interaction                            | Done    | Blocked by US-01                |
| 04  | [us-04-addition-execution](us-04-addition-execution.md) | Add movies from queue to Radarr with search trigger                                   | Done    | Blocked by US-01, PRD-071 US-01 |
| 05  | [us-05-disk-space-gating](us-05-disk-space-gating.md)   | Addition gating: only add movies when free space is above target                      | Done    | Blocked by US-02, US-04         |
| 06  | [us-06-daily-cron](us-06-daily-cron.md)                 | Scheduler: cron-based job orchestrating the full cycle                                | Partial | Blocked by US-02, US-03, US-04  |

## Out of Scope

- TV show rotation
- Smart removal selection based on ratings/comparisons (future enhancement)
- Multi-instance Radarr support
- Notification system (email/push when movies are leaving)

## Drift Check

last checked: 2026-04-17
