# Rotation Engine

Status: Partial — the disk-driven cycle, leaving lifecycle, addition gating, scheduler, disk-space read, and rotation log are all shipped. Three gaps are deferred to [ideas/](../ideas/): the scheduler runs on a fixed **interval** (cron expression is persisted but inert), shutdown does **not** drain an in-progress cycle, and the watchlist add flow does **not** auto-clear a movie's `leaving` status.

A daily automated cycle that keeps the movie library inside a free-disk-space budget. Each run: sweeps expired "leaving" movies (deleting them from Radarr), measures free space, marks the oldest eligible movies as "leaving" until the deficit is covered, then — if space permits — tops the library up with candidates from the queue (see [source-lists](source-lists.md)). The count removed or added on any given day is variable, driven entirely by disk usage, never a fixed number.

The candidate queue, sources, and exclusion list live in **[source-lists](source-lists.md)**; the rotation-log UI in **[rotation-ui](rotation-ui.md)**. This PRD owns the cycle engine, the leaving state machine, the scheduler, and the rotation log.

## Data Model

Rotation state rides on the existing `movies` table plus two pillar-owned tables. All in the media pillar's own SQLite DB.

`movies` rotation columns:

| Column                | Type                                   | Default | Notes                                                                                                                                               |
| --------------------- | -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rotation_status`     | `text` enum `'leaving' \| 'protected'` | `null`  | `null` = normal/eligible; `'leaving'` = marked for deletion; `'protected'` = manually downloaded, shielded. Indexed (`idx_movies_rotation_status`). |
| `rotation_expires_at` | text (ISO)                             | `null`  | `leaving` → deletion time; `protected` → when shielding lapses.                                                                                     |
| `rotation_marked_at`  | text (ISO)                             | `null`  | When marked, for the UI countdown.                                                                                                                  |

`rotation_log` — one row per cycle: `id`, `executed_at`, `movies_marked_leaving`, `movies_removed`, `movies_added`, `removals_failed`, `free_space_gb` (real), `target_free_gb` (real), `skipped_reason` (nullable), `details` (JSON `{ marked, removed, added, failed }` of `{ tmdbId, title }` refs, written only when at least one list is non-empty).

`rotation_settings` — pillar-owned key/value store (opaque strings; the media pillar cannot reach `registry`/`core` settings). Numbers stringified, the enabled flag is `'true'` / `''`. Keys and defaults:

| Setting          | Key                        | Default     | Drives                            |
| ---------------- | -------------------------- | ----------- | --------------------------------- |
| `enabled`        | `rotation_enabled`         | `''`        | scheduler on/off                  |
| `cronExpression` | `rotation_cron_expression` | `0 3 * * *` | persisted, **inert** (see status) |
| `targetFreeGb`   | `rotation_target_free_gb`  | `100`       | removal deficit + addition gate   |
| `leavingDays`    | `rotation_leaving_days`    | `7`         | grace window                      |
| `dailyAdditions` | `rotation_daily_additions` | `2`         | addition cap                      |
| `avgMovieGb`     | `rotation_avg_movie_gb`    | `15`        | addition space budgeting          |
| `protectedDays`  | `rotation_protected_days`  | `30`        | manual-download shield window     |

- [x] `movies` carries the three nullable rotation columns; the status enum is constrained to `'leaving' | 'protected'`; `rotation_status` is indexed.
- [x] `rotation_log` exists with the columns above; `details` is JSON, populated only when a per-movie list is non-empty.
- [x] Settings live in the pillar `rotation_settings` kv table (not a shared/core store); unset keys fall back to the defaults above.

## REST API Surface

Engine routes on the media pillar's ts-rest contract (`/rotation/...`). The data-plane queue routes (`/rotation/candidates`, `/rotation/exclusions`, `/rotation/sources`, `/rotation/source-types`, `/rotation/plex-friends`) belong to [source-lists](source-lists.md).

- `GET /rotation/settings` — settings with defaults applied.
- `POST /rotation/settings` — partial save; returns `{ success, updated }`.
- `GET /rotation/scheduler/status` — `{ isRunning, isCycleRunning, intervalMs, cronExpression, lastCycleAt, lastCycleError, nextRunAt }`.
- `POST /rotation/scheduler/toggle` — `{ enabled, cronExpression? }`; start or stop the timer, persisting `rotation_enabled`.
- `POST /rotation/scheduler/run-now` — run one cycle immediately; returns the cycle summary, or `{ success: false, result: null }` if a cycle is already running.
- `GET /rotation/scheduler/leaving` — movies in `leaving`, soonest expiry first.
- `POST /rotation/scheduler/leaving/:movieId/cancel` — clear `leaving`; `{ success, message }` (`success:false`, not 404, when the movie is not leaving).
- `GET /rotation/scheduler/last-cycle` — most recent log row, or `null`.
- `GET /rotation/scheduler/disk-space` — `{ available, disks[] }`; degrades to `available:false` when Radarr is unreachable.
- `GET /rotation/scheduler/log` — paginated rows (`limit` 1–100, `offset`), newest first.
- `GET /rotation/scheduler/log-stats` — `{ totalRotated, avgPerDay, streak }`.

Cross-pillar / external calls are made through the env-configured Radarr client: `/api/v3/diskspace`, `/api/v3/movie` (for `sizeOnDisk`), `/api/v3/queue`, `DELETE /movie/{id}?deleteFiles=true`, `POST /movie` (add with search).

- [x] `GET`/`POST /rotation/settings` read and partially persist the settings, applying defaults for unset keys.
- [x] The scheduler surface (`status`, `toggle`, `run-now`, `leaving`, `leaving/:id/cancel`, `last-cycle`, `disk-space`, `log`, `log-stats`) is exposed exactly as above.
- [x] `disk-space` returns `available:false` with an empty disk list when Radarr is unconfigured or throws.

## Business Rules

- **Cycle order** — `executeRotationCycle`: sync sources → sweep expired `leaving` (delete from Radarr) → measure free space → mark new `leaving` → re-measure → add from queue.
- **Disk-driven removals** — `deficit = max(0, target_free_gb − current_free_gb − Σ sizeOnDisk of already-`leaving` movies)`. Already-leaving space counts toward the budget (it reclaims soon). If `deficit ≤ 0`, mark nothing.
- **Oldest-first selection** — eligible movies are ordered `created_at` ASC; the engine walks the list accumulating `sizeOnDisk` and marks movies until the running total ≥ deficit, then stops. Deterministic — bytes drive the count, not a fixed number. A single large 4K file can cover the whole deficit alone.
- **Eligibility exclusions** — excluded from removal: watchlist movies (joined from the pillar's local `media_watchlist`), unexpired `protected` movies, already-`leaving` movies, movies currently downloading in Radarr (queue ↔ movie-list join), and movies with `sizeOnDisk` 0 or absent (no space to reclaim).
- **Leaving grace + sweep** — marking sets `rotation_status='leaving'`, `rotation_expires_at = now + leavingDays`, `rotation_marked_at = now`. The next cycle's sweep finds `leaving` movies past expiry, deletes each from Radarr with `deleteFiles=true`, then clears all three rotation fields. A movie absent from Radarr (deleted externally) is cleared in POPS without error.
- **Failure isolation** — a single failed deletion is logged and the sweep continues; it never aborts the cycle. Missed work does not carry over as a backlog — the next cycle simply re-measures and re-decides.
- **Addition gating** — after removals, free space is re-measured. Budget = `min(dailyAdditions, floor((free − target) / avgMovieGb))`, and `0` when `free < target` or `avgMovieGb ≤ 0`. The gate is a cap, not a driver: if free space is still below target, additions are skipped with reason `"additions skipped — below target free space"`.
- **Addition execution** — up to `budget` candidates are drawn via the weighted selection policy (see [source-lists](source-lists.md)); each is added to Radarr (skipping any already present) with a search trigger, the POPS library entry is best-effort enriched from TMDB, and the candidate is marked `added` / `skipped`. Movies added this way get `rotation_status = null` — immediately eligible for future rotation.
- **Manual-download protection** — downloading a candidate directly sets `rotation_status='protected'` so it is shielded from removal while unexpired. Expired `protected` movies fall through the eligibility filter back into the removal pool.
- **Single-flight** — a cycle already running causes the new invocation to write a skipped row (`"Concurrent cycle already running"`) and return without re-entering.
- **Resume on boot** — `server.ts` calls `resumeIfEnabled` on startup; the scheduler auto-arms when `rotation_enabled = 'true'` (mirrors the Plex scheduler). `MEDIA_ROTATION_SCHEDULER_ENABLED=true` force-starts regardless of the persisted flag.
- **Skip reasons** — a cycle that cannot proceed writes a row with `skipped_reason`: `"Radarr not configured"`, `"Radarr unavailable — cannot measure disk space"` (carrying any removals already done), or a `"Cycle error: …"` on an unexpected throw. The `streak` stat counts consecutive non-skipped cycles.

- [x] Deficit math matches `max(0, target − free − leavingSize)`; `≤ 0` marks nothing.
- [x] Eligible movies are walked oldest-first, accumulating `sizeOnDisk` until the deficit is covered, then marking stops.
- [x] Watchlist, unexpired-protected, already-leaving, downloading, and zero-size movies are all excluded from selection.
- [x] Expiry sweep deletes from Radarr with `deleteFiles=true` and clears rotation fields; one failed delete is logged and the sweep continues; externally-removed movies clear without error.
- [x] Addition budget = `min(dailyAdditions, floor((free − target) / avgMovieGb))`, `0` below target; additions skip with the below-target reason when budget is 0.
- [x] Candidates are added to Radarr with a search trigger, skipping any already present; added movies get `rotation_status = null`.
- [x] Manual candidate download sets `rotation_status='protected'`; expired protected movies become eligible again.
- [x] A concurrent cycle writes a skipped row and returns without re-running; the scheduler resumes on boot when enabled.

## Edge Cases

| Case                                    | Behaviour                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deficit exceeds total eligible bytes    | Mark all eligible; remaining deficit naturally persists to next cycle (free space stays below target).                                                    |
| Deficit ≤ 0                             | Mark nothing this cycle.                                                                                                                                  |
| Empty candidate queue                   | Skip additions, reason `"no pending candidates in queue"`.                                                                                                |
| Radarr unconfigured                     | Cycle short-circuits, reason `"Radarr not configured"`.                                                                                                   |
| Radarr unreachable mid-cycle            | After the sweep, a failed disk read aborts the rest, reason `"Radarr unavailable — cannot measure disk space"`, removals already done are still recorded. |
| Movie deleted from Radarr externally    | Sweep clears it in POPS without error.                                                                                                                    |
| Single 80 GB 4K file covers the deficit | Just that one movie is marked — bytes, not count, drive selection.                                                                                        |
| `sizeOnDisk` 0 (not yet downloaded)     | Excluded from selection — nothing to reclaim.                                                                                                             |
| All movies watchlisted/protected        | 0 eligible; additions still proceed if space allows.                                                                                                      |
| `run-now` while a cycle runs            | Returns `{ success:false, result:null }`; no second cycle starts.                                                                                         |

- [x] Each listed edge case behaves as described and (where it ends a cycle) writes the stated `skipped_reason`.

## Out of Scope

- TV-show rotation.
- Rating/comparison-based removal selection (oldest-first only).
- Multi-instance Radarr.
- Leaving-soon notifications (email/push).
