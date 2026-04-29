# PRD-072: Rotation UI

> Epic: [Library Rotation](../../epics/08-library-rotation.md)

## Overview

The UI layer for the library rotation system. Surfaces the "Leaving Soon" countdown on movie cards and in a dedicated shelf, provides a settings page for rotation configuration, and offers management views for source lists, the candidate queue, and the exclusion list. Two distinct action buttons — "Add to Queue" and "Download" — give users control over how movies enter the library.

## Pages & Components

### Leaving Soon Shelf (Library page + Discover page)

A shelf showing movies with `rotation_status = 'leaving'`, sorted by `rotation_expires_at` ascending (soonest first). Appears in two places:

1. **Library page** — as a pinned shelf near the top, above the general library grid
2. **Discover page** — registered as a shelf in the shelf registry (PRD-065). Category: `local`. Always included when there are leaving movies (not subject to the random shelf assembly — it's pinned at the top of the Discover page alongside any other pinned shelves).

Shelf behaviour:

- Each card shows a per-item countdown badge: "Leaving today" (≤ 0 days), "Leaving tomorrow" (1 day), "Leaving in N days" (2–6 days), or "Leaving in N week(s)" (≥ 7 days, using `Math.floor`)
- Clicking a card opens the movie detail page (existing)
- A "Keep" action on each card clears the leaving status (calls `rotation.cancelLeaving`)
- Adding a leaving movie to the watchlist also clears leaving status (handled by PRD-070 business rule)

### Leaving Soon Badge (Movie Cards)

On any movie card across the app (library, search results, detail page), if the movie has `rotation_status = 'leaving'`:

- Show a countdown badge overlaid on the poster (bottom-left or top-right corner)
- Badge style: urgent red when ≤ 3 days, warning amber when ≤ 7 days, neutral when > 7 days

### Rotation Settings Page

Located under Media settings. Controls:

| Setting            | Input                                                     | Description                                                             |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Enabled            | Toggle                                                    | Master on/off switch                                                    |
| Schedule           | Cron input or preset picker (daily at 3am, 6am, midnight) | When the job runs                                                       |
| Leaving window     | Number input (days)                                       | How long movies stay in "leaving" state before deletion                 |
| Daily additions    | Number input                                              | Max movies to add per cycle (gated by disk space)                       |
| Target free space  | Number input (GB)                                         | Minimum free disk space — drives how many movies get marked for removal |
| Average movie size | Number input (GB)                                         | Fallback estimate when Radarr `sizeOnDisk` unavailable                  |
| Protected days     | Number input                                              | How long manually-downloaded movies are shielded from rotation          |

Also displays:

- Current disk space (live from Radarr)
- Last rotation run summary (timestamp, counts, errors)
- Next scheduled run time
- A "Run Now" button to trigger a manual cycle

### Source List Management Page

CRUD interface for rotation sources.

- List view: source name, type icon, priority (visual indicator), enabled toggle, last synced, candidate count
- Create/edit modal: type selector, name, priority slider (1-10), type-specific config fields, sync interval
- Delete with confirmation (warns about candidate deletion)
- "Sync Now" button per source
- Drag-to-reorder for priority (visual, updates priority values)

Type-specific config fields:

| Source Type      | Config Fields                                   |
| ---------------- | ----------------------------------------------- |
| `plex_watchlist` | None (uses connected Plex account)              |
| `plex_friends`   | Friend username picker (from Plex friends list) |
| `imdb_top_100`   | None (hardcoded URL)                            |
| `letterboxd`     | List URL                                        |
| `manual`         | None (system-managed, one per install)          |

### Candidate Queue Page

Tabbed view showing the candidate pipeline:

- **Pending** tab: movies waiting to be added. Shows title, year, rating, source name, priority badge, discovered date. Actions: "Download" (bypass queue), "Exclude"
- **Added** tab: movies that were added by the rotation engine. Shows added date
- **Excluded** tab: the exclusion list. Shows title, excluded date, reason. Action: "Un-exclude"

Each tab is paginated and searchable by title.

### Add to Queue / Download Buttons

On movie discovery pages (search results, Discover page, external recommendations):

- **"Add to Queue"** — adds the movie to `rotation_candidates` with source = `manual`. Does NOT trigger a Radarr download. Toast confirmation: "Added to rotation queue"
- **"Download"** — adds to Radarr immediately with `searchForMovie: true`, creates POPS library entry with `rotation_status = 'protected'`. Toast confirmation: "Downloading — protected for 30 days"

Button placement: side by side where the current "Request" button lives. If the movie is already in the library, show status instead. If already in the queue, show "In Queue" badge.

### Rotation Log Page

Paginated history of rotation cycles. Each entry shows:

- Execution timestamp
- Movies marked leaving (count + expand to see titles)
- Movies removed (count + titles)
- Movies added (count + titles)
- Failed removals (count + details)
- Disk space at time of run
- Skip reason if applicable

## Business Rules

- **Badge urgency thresholds:** ≤ 3 days = red, ≤ 7 days = amber, > 7 days = neutral. These are hardcoded — no config needed.
- **"Keep" action:** Calls `rotation.cancelLeaving(movieId)`. Resets `rotation_status` to `null`, clears `rotation_expires_at` and `rotation_marked_at`. The movie re-enters the eligible pool and may be selected again in a future cycle.
- **Settings validation:** Daily additions ≥ 1, leaving window ≥ 1 day, target free space ≥ 0, avg movie size > 0, protected days ≥ 0.
- **Source creation:** The `manual` source is auto-created on first use and cannot be deleted. All other sources are user-managed.
- **Queue/Download mutual exclusivity per movie:** If a movie is in the queue and the user clicks "Download", remove it from the queue and add directly. If a movie was already downloaded (in library), don't show "Add to Queue."

## Edge Cases

| Case                                         | Behaviour                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotation disabled                            | Settings page shows all controls greyed out except the toggle. Leaving Soon shelf hidden on both Library and Discover pages                                                                                          |
| No sources configured                        | Source page shows empty state with setup prompt. Rotation can run but will have no candidates to add                                                                                                                 |
| Radarr disconnected                          | Settings page shows warning. "Run Now" disabled. Disk space shows "unavailable"                                                                                                                                      |
| Movie in queue and in library simultaneously | Show "In Library" badge, hide queue actions. Candidate status = `skipped`                                                                                                                                            |
| User cancels leaving on a movie daily        | No limit on "Keep" actions. The movie re-enters the eligible pool. Since removal is oldest-first and deterministic, it will be re-selected if it's still among the oldest. Add to watchlist for permanent protection |

## User Stories

| #   | Story                                                           | Summary                                                                   | Status | Parallelisable                          |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | --------------------------------------- |
| 01  | [us-01-leaving-soon-shelf](us-01-leaving-soon-shelf.md)         | Leaving Soon shelf on Library + Discover pages, countdown badges on cards | Done   | Blocked by PRD-070 US-03                |
| 02  | [us-02-rotation-settings](us-02-rotation-settings.md)           | Rotation settings page with all configuration controls                    | Done   | Blocked by PRD-070 US-01                |
| 03  | [us-03-source-management](us-03-source-management.md)           | Source list CRUD page with type-specific config                           | Done   | Blocked by PRD-071 US-01                |
| 04  | [us-04-candidate-queue](us-04-candidate-queue.md)               | Candidate queue page with tabs (pending, added, excluded)                 | Done   | Blocked by PRD-071 US-01                |
| 05  | [us-05-queue-download-buttons](us-05-queue-download-buttons.md) | "Add to Queue" and "Download" buttons on discovery pages                  | Done   | Blocked by PRD-071 US-01, PRD-070 US-01 |
| 06  | [us-06-rotation-log](us-06-rotation-log.md)                     | Rotation execution history page                                           | Done   | Blocked by PRD-070 US-06                |

## Out of Scope

- Push notifications (email, mobile) for leaving movies
- Calendar view of rotation schedule
- Drag-to-reorder candidate queue priority
- Public sharing of rotation stats

## Drift Check

last checked: 2026-04-27
