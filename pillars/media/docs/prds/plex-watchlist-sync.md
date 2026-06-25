# Plex Watchlist Sync

Status: Partial — Plex → POPS pull sync is built and wired (on-demand job + scheduler tick). POPS → Plex inline push is NOT built (see [ideas/plex-watchlist-push.md](../ideas/plex-watchlist-push.md)); the watchlist sync UI is a single header button, not a rich settings-page status panel (see the same idea file).

Pulls the Plex Universal Watchlist (the cloud feature on `discover.provider.plex.tv`, not the local Media Server) into the media pillar's `watchlist` table. Items the user adds on any Plex client appear in the POPS watchlist after the next sync. Reconciliation tracks each entry's `source` so a manually-added POPS item is never silently removed because Plex lacks it.

Plex auth (token + client id) comes from the PIN handshake persisted in `plex_settings` (see the Plex connection PRD). The watchlist endpoints use `X-Plex-Token` + `X-Plex-Client-Identifier`.

## Data model — `watchlist` table

The watchlist row carries two sync-tracking columns alongside the CRUD fields:

| Column            | Type | Constraint                  | Purpose                                                           |
| ----------------- | ---- | --------------------------- | ----------------------------------------------------------------- |
| `source`          | TEXT | NOT NULL DEFAULT `'manual'` | Origin of the entry: `'manual'`, `'plex'`, or `'both'`            |
| `plex_rating_key` | TEXT | nullable                    | Plex discover ratingKey — the cloud item id seen during pull sync |

The `(media_type, media_id)` unique index makes inserts idempotent. `source` distinguishes "user added in POPS" from "pulled from Plex" so removal reconciliation never deletes a manual entry.

- [x] `source` column exists, NOT NULL, defaults to `'manual'`; existing rows read back as `'manual'`.
- [x] `plex_rating_key` column exists, nullable.
- [x] `WatchlistEntry` contract schema (`GET /watchlist`, `GET /watchlist/:id`) returns `source` and `plexRatingKey`.

## REST API surface (ts-rest contract under `/media`)

| Method | Path                | Notes                                                                                  |
| ------ | ------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/plex/sync`        | Start an async sync job; body `{ jobType: "plexSyncWatchlist" }`. Returns `{ jobId }`. |
| GET    | `/plex/sync/active` | Currently-running jobs.                                                                |
| GET    | `/plex/sync/last`   | Most recent completed result per job type (keyed by job type).                         |
| GET    | `/plex/sync/:jobId` | Poll one job by id (404 if unknown).                                                   |

`plexSyncWatchlist` is one member of the sync-job type enum (`plexSyncMovies`, `plexSyncTvShows`, `plexSyncWatchlist`, `plexSyncWatchHistory`). The job runs async in-process; the result payload is `{ total, processed, added, removed, skipped, errors[], skipReasons[] }`.

The watchlist CRUD routes (`GET/POST /watchlist`, `GET /watchlist/:id`, `GET /watchlist/status`, `PATCH /watchlist/:id`, `DELETE /watchlist/:id`, `POST /watchlist/reorder`) are unchanged by sync — they do not call Plex.

- [x] `POST /plex/sync` with `jobType: "plexSyncWatchlist"` starts the pull sync and returns a `jobId`.
- [x] `GET /plex/sync/last` exposes the latest `plexSyncWatchlist` result for the UI.

## Plex Discover cloud endpoint used

| Operation      | Method | Endpoint                                                           |
| -------------- | ------ | ------------------------------------------------------------------ |
| List watchlist | GET    | `https://discover.provider.plex.tv/library/sections/watchlist/all` |

Paginated with `X-Plex-Container-Start` / `X-Plex-Container-Size` (page size 50); loops until a short page or `totalSize` is reached. The add/remove `actions/*` PUT endpoints and the `metadata.provider.plex.tv/.../userState` endpoint are NOT used — they belong to the unbuilt push (see idea file).

## Pull sync (Plex → POPS) reconciliation

For each item on the Plex cloud watchlist:

1. Resolve to a local media record. Extract the TMDB id (movies) or TheTVDB id (TV) from the item's `Guid` array; fall back to a TMDB/TVDB title+year search when no id is present. If neither resolves, **skip** with a reason (title + cause).
2. If the resolved movie/show is not in the POPS library, import it first (same TMDB/TVDB ingest as library sync), then proceed.
3. Insert / upgrade the watchlist entry:
   - No existing entry → insert with `source='plex'`, `plex_rating_key` set. Counts as `added`.
   - Existing `source='manual'` → upgrade to `source='both'`, set `plex_rating_key`.
   - Existing `source='plex'` (or null) → keep `source='plex'`, refresh `plex_rating_key`.
4. After processing all upstream items, reconcile entries with a `plex_rating_key` no longer seen:
   - `source='plex'` and absent upstream → **delete** (counts as `removed`).
   - `source='both'` and absent upstream → **downgrade** to `source='manual'`, clear `plex_rating_key`.

The discover ratingKey is the `ratingKey` field on each upstream item (e.g. `5d776830880197001ec955e8`), stored verbatim in `plex_rating_key`.

- [x] Items with a resolvable TMDB/TVDB id are matched; missing-id items fall back to title+year search.
- [x] Items absent from the POPS library are imported before being watchlisted.
- [x] New upstream items insert with `source='plex'` and `plex_rating_key`.
- [x] `manual` → `both` escalation on a match; `both` → `manual` downgrade (not delete) when the item leaves Plex.
- [x] Only `source='plex'` entries are deleted on upstream removal; `manual`/`both` are never deleted by the pull.
- [x] Unresolvable items are skipped with a reason; pull is idempotent (rerun yields the same table state).

## Scheduling

Both the on-demand job runner and the periodic scheduler tick call the same `syncWatchlistFromPlex`:

- On-demand: `POST /plex/sync { jobType: "plexSyncWatchlist" }`.
- Scheduler tick: runs movies → TV → watchlist in sequence; the watchlist op needs no library section id, so it still runs when section ids are unset. Per-item errors are collected as `watchlist:<title>: <reason>` into the tick's `sync_logs` row. A missing Plex token short-circuits the watchlist op (no error).

- [x] Scheduler tick invokes watchlist sync after movies and TV.
- [x] Watchlist sync runs without a section id; absent token skips it cleanly.

## UI

The watchlist page header has a "Sync with Plex" button (`WatchlistPlexSyncButton`) that starts the `plexSyncWatchlist` job via the shared `useSyncJob` hook, shows a spinner + "Syncing…" while running and disables itself, and invalidates the watchlist list query on the running → completed transition so freshly-pulled rows appear. Completion/failure toasts come from the hook.

- [x] Header button triggers a manual `plexSyncWatchlist` job and reflects running state.
- [x] On completion the watchlist list refetches.

## Business rules & edge cases

- The Plex watchlist is cloud-based (`discover.provider.plex.tv`), independent of the local Plex Media Server.
- Pull sync is additive by default — it only deletes entries it owns (`source='plex'`).
- `source='both'` means the item exists in both systems; the pull downgrades rather than deletes it when Plex drops it, preserving the local intent.
- Unsupported Plex item types (anything other than `movie` / `show`) are skipped with a reason.
- The pull never blocks on a single item: per-item exceptions are caught and recorded in `errors[]`, then processing continues.

## Out of scope

- Real-time sync via Plex webhooks (polling is sufficient).
- Watchlist priority/ordering sync (Plex has no priority concept).
- Syncing watchlist notes or any metadata beyond the item reference.
