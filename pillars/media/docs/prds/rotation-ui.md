# Rotation UI

Status: Partial — leaving-soon shelf + badges, candidate-queue page, queue/download buttons, rotation log, and the field-based rotation settings panel ship. The scheduler observability controls (Run Now, live disk space, last-run summary, next-run time) and the source-management surface are not wired into the app — see [ideas/rotation-ui-scheduler-controls-and-source-page.md](../ideas/rotation-ui-scheduler-controls-and-source-page.md).

The user-facing layer over the rotation engine (`prds/rotation-engine`): show which movies are about to leave the library, let the user keep them, browse the candidate pipeline, control how new movies enter the library, and review past rotation cycles. Configuration is driven by the pillar's settings manifest, rendered by the shell settings host.

Posters render via the byte route `GET /media/images/movie/:tmdbId/poster.jpg` (Express static/proxy over `MEDIA_IMAGES_DIR`, not part of the ts-rest contract).

## Pages & components (app)

| Surface                | Route / mount                                  | What it shows                                       |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Library page           | `/media` (index)                               | `LeavingSoonShelf` pinned above the grid            |
| Discover page          | `/media/discover`                              | server-assembled `leaving-soon` shelf, pinned first |
| Candidate Queue        | `/media/rotation/candidates`                   | tabbed pending / added / excluded                   |
| Rotation Log           | `/media/rotation/log`                          | paginated cycle history + summary stats             |
| Rotation settings      | `/media/rotation` → `/settings#media.rotation` | field-based settings panel (shell host)             |
| Movie cards everywhere | search, shelves, watchlist, movie detail       | `LeavingBadge` overlay + `MovieActionButtons`       |

## REST surface consumed (all under the media pillar contract)

- Data plane: `POST/GET/DELETE /rotation/candidates`, `GET /rotation/candidates/status/:tmdbId`, `POST /rotation/candidates/:candidateId/download`, `POST/GET/DELETE /rotation/exclusions[/:tmdbId]`.
- Scheduler/observe: `GET /rotation/scheduler/status`, `GET /rotation/scheduler/leaving`, `POST /rotation/scheduler/leaving/:movieId/cancel`, `GET /rotation/scheduler/log`, `GET /rotation/scheduler/log-stats`.
- Settings persist via the shell settings host writing the `rotation_*` keys (pillar-owned `rotation_settings` kv table); `GET/POST /rotation/settings` back the same store.
- Radarr gating: `GET /arr/config` (`radarrConfigured`) and `GET /arr/radarr/movies/:tmdbId/status` gate the download/request buttons.

## Leaving Soon shelf + badges

- Shelf appears on the Library page when ≥1 movie has rotation status `leaving`; hidden otherwise (`schedulerLeavingMovies` returns empty when rotation is off or nothing is leaving).
- Discover surfaces the same set via the server-side shelf registry: `leaving-soon` is `category: 'local'`, `pinned: true`, bypasses the minimum-items threshold so even a single expiring movie shows, and is prepended before randomly assembled shelves.
- Both orderings are soonest-expiry-first (`rotationExpiresAt` ASC), enforced by the `schedulerLeavingMovies` route.
- Each card shows a `LeavingBadge` countdown computed from `rotationExpiresAt` via `Math.ceil` of day-diff: "Leaving today" (≤ 0), "Leaving tomorrow" (1), "Leaving in N days" (2–6), "Leaving in N week(s)" (≥ 7, `Math.floor(days/7)`).
- Badge colour: destructive/red ≤ 3 days, amber ≤ 7 days, neutral otherwise. Thresholds are hardcoded.
- The same `LeavingBadge` renders on movie cards elsewhere — search results, discover shelf items, watchlist, movie detail — reusing the existing card components, never a new card type.
- A per-card "Keep" quick-action (hover icon button) clears the leaving status via `schedulerCancelLeaving`; the engine resets `rotation_status`, `rotation_expires_at`, `rotation_marked_at` so the movie re-enters the eligible pool.

Acceptance:

- [x] Leaving Soon shelf on Library page when leaving movies exist; hidden when none / rotation off
- [x] `leaving-soon` is a pinned `local` shelf on Discover, bypasses min-items, prepended first
- [x] Cards sorted by `rotationExpiresAt` ASC on both surfaces
- [x] Countdown text and colour thresholds match the rules above
- [x] Countdown badge also appears on search, shelf, watchlist, and detail cards when leaving
- [x] "Keep" quick-action clears leaving status via `schedulerCancelLeaving`

## Candidate Queue page

Three tabs, each paginated (20/page) and searchable by title against `listCandidates` / `listExclusions`.

- **Pending** — `status='pending'` candidates: poster, title, year, rating, source name, priority badge, discovered date. Tab label carries a total-count badge. Actions: **Download** (`downloadCandidate` — Radarr add + library entry + protect, removes from queue) and **Exclude** (`addExclusion`, optional reason).
- **Added** — `status='added'` candidates, read-only.
- **Excluded** — exclusion entries: poster, title, excluded date, reason. Action: **Un-exclude** (`removeExclusion`).

Acceptance:

- [x] Three tabs (Pending / Added / Excluded) with pending count badge on the tab
- [x] Pending tab Download bypasses the queue → Radarr and protects; Exclude moves to exclusion list with optional reason
- [x] Added tab is read-only; Excluded tab supports Un-exclude
- [x] Each tab paginated and title-searchable

## Add to Queue / Download buttons

`MovieActionButtons` renders on non-library movie cards (search, discover overlay, movie detail). Gating, in order:

1. Rotation disabled (`schedulerStatus.isRunning === false`) → fall back to the existing single `RequestMovieButton` flow. No config migration; purely conditional rendering.
2. Movie already in Radarr (status ≠ `not_found`) → hide rotation buttons (library status shown by existing UI).
3. Excluded → "Excluded" badge with un-exclude.
4. In queue → "In Queue" badge with remove.
5. Otherwise → **Add to Queue** (`addToQueue`, source `manual`, toast "Added to rotation queue") and, when Radarr is configured, **Download** (opens the download modal → Radarr add with search + library entry, `rotation_status = 'protected'`).

Acceptance:

- [x] Two-button pattern only when rotation is enabled; otherwise the original request flow renders
- [x] Add to Queue creates a `manual` candidate and toasts; In Queue badge after
- [x] Download routes through Radarr and protects the new library entry; only shown when Radarr configured
- [x] In-library movies hide the rotation buttons; excluded / queued movies show their respective badge with an undo action

## Rotation Log page

Paginated history (20/page, newest first) of `listRotationLog` rows with a `rotationLogStats` summary header.

- Summary stats: total movies rotated (all-time), average per day, current streak.
- Each entry: executed timestamp, movies marked leaving / removed / added / failed-removals counts, free space at run, skip reason.
- Entries are expandable to per-movie detail parsed from the row `details` JSON; entries with errors or skip reasons get warning styling.
- Empty state when no cycle has run.

Acceptance:

- [x] Paginated, newest-first log with summary stats header (total / avg-per-day / streak)
- [x] Collapsed row shows the counts + disk space + skip reason; expand reveals per-category movie detail
- [x] Empty state when no cycles have run

## Rotation settings (field-based panel)

The `/media/rotation` route redirects to the shell settings host at `#media.rotation`, which renders the pillar's `media.rotation` settings manifest:

- **Schedule** — `rotation_enabled` toggle, `rotation_cron_expression` text (default `0 3 * * *`).
- **Capacity** — `rotation_target_free_gb` (min 0), `rotation_avg_movie_gb` (min 1).
- **Protection** — `rotation_protected_days` (min 0), `rotation_daily_additions` (min 1), `rotation_leaving_days` (min 1).

Download defaults (Radarr quality profile + root folder used by the Download button) live in the `media.arr` manifest's Download Defaults group, populated from `GET /arr/radarr/quality-profiles` / `GET /arr/radarr/root-folders`.

Acceptance:

- [x] Rotation config editable from a settings panel: enable toggle, cron, target free space, avg movie size, protected days, daily additions, leaving window — each with its validation bound
- [x] Values persist to the pillar-owned `rotation_settings` kv store
- [x] Download Defaults (quality profile, root folder) selectable from live Radarr options

## Business rules

- Badge urgency thresholds are hardcoded (≤3 red, ≤7 amber, else neutral) — no config.
- "Keep" re-enters the movie into the eligible pool; no limit on keeps. Permanent protection comes from adding to the watchlist (rotation-engine rule).
- Queue/Download mutual exclusivity: Download removes a pending queue entry then adds directly; in-library movies never offer "Add to Queue".

## Edge cases

| Case                          | Behaviour                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Rotation disabled             | Leaving shelf hidden (no leaving movies returned); movie cards fall back to the single Request button     |
| Radarr disconnected           | Download button hidden (gated on `radarrConfigured` from `GET /arr/config`); request flow still available |
| Movie in queue and in library | Library status wins; rotation buttons hidden                                                              |
| User keeps a movie repeatedly | Allowed; it stays eligible and may be re-selected (removal is deterministic oldest-first)                 |

## Out of scope

- Push/email notifications for leaving movies
- Calendar view of the rotation schedule
- Drag-to-reorder candidate or source priority
- Public sharing of rotation stats
