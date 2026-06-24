# Plex Sync

Status: Partial — backend connection, auth, library/watch-history sync, and the
periodic scheduler are shipped; the frontend is a generic settings panel plus a
single watchlist sync button. The PIN-based OAuth UI and the Plex Discover cloud
watch-state backfill are not built — see
[ideas/plex-discover-watch-sync.md](../../ideas/plex-discover-watch-sync.md) and
[ideas/plex-pin-auth-ui.md](../../ideas/plex-pin-auth-ui.md).

Pull-based sync with a Plex Media Server. POPS owns the library; Plex is one
input source, never the source of truth. Imports movies, TV hierarchy, and watch
state into the media pillar's own SQLite. All Plex routes live under the
`plex.*` sub-router of the media ts-rest contract (`/plex/*`).

## Data Model

Connection + scheduler state lives in the pillar-owned `plex_settings` table
(key/value, opaque string values) — the media pillar cannot reach any shared
settings store, so it persists its own. Keys: `plex_url`, `plex_token`
(AES-256-GCM ciphertext, base64 `iv|tag|ciphertext`), `plex_username`,
`plex_client_identifier`, `plex_encryption_seed`, `plex_movie_section_id`,
`plex_tv_section_id`, `plex_scheduler_enabled`, `plex_scheduler_interval_ms`.

The encryption key derives, in order: `ENCRYPTION_KEY` env var → a persisted
random seed → a freshly generated seed written back to `plex_settings`. All via
`scrypt`.

Sync jobs persist to `sync_job_results`; scheduler runs persist to a sync-log
table read by `getLastSyncAt` / `getLastSyncCounts` / `getLastSyncError`.

Watch events land in `watch_history` (the table the
[watch-history](../watch-history/README.md) PRD owns). Unique index on
`(media_type, media_id, watched_at)` dedupes repeated syncs.

## REST API Surface (`plex.*`)

Connection / auth / config:

- `GET /plex/url` · `POST /plex/url` — read / validate+persist the server URL
- `GET /plex/test-connection` — returns `{ connected, error? }`
- `GET /plex/libraries` — list Plex sections
- `GET /plex/sync-status` — `{ configured, hasUrl, hasToken, connected }`
- `GET /plex/username` — connected Plex username
- `POST /plex/auth/pin` — create a plex.tv PIN → `{ id, code, clientId }`
- `POST /plex/auth/pin/check` — poll the PIN; persists token + username on claim
- `POST /plex/disconnect` — clear token + username
- `GET /plex/section-ids` · `POST /plex/section-ids` — read / save movie + TV section ids

On-demand sync (async, in-process job runner — no queue):

- `POST /plex/sync` — start a job (`jobType` ∈ `plexSyncMovies`, `plexSyncTvShows`, `plexSyncWatchlist`, `plexSyncWatchHistory`); returns `{ jobId }` immediately
- `GET /plex/sync/active` — running jobs
- `GET /plex/sync/last` — most recent completed result per job type
- `GET /plex/sync/:jobId` — poll a job (404 if unknown)

Scheduler:

- `POST /plex/scheduler/start` — arm periodic sync (fires one tick immediately)
- `POST /plex/scheduler/stop`
- `GET /plex/scheduler/status` — `{ isRunning, intervalMs, lastSyncAt, lastSyncError, nextSyncAt, moviesSynced, tvShowsSynced }`
- `GET /plex/scheduler/sync-logs?limit=` — recent sync-log entries, newest first

## Business Rules

- POPS owns the library — sync is **additive only**, never deletes POPS items.
- Match keys: TMDB id for movies, TheTVDB id for TV shows, extracted from Plex's
  `Guid` array. External-id extraction (`parseGuids`) parses the modern Plex
  agent scheme format (`tmdb://`, `tvdb://`, `imdb://`) via a `scheme://id`
  regex; entries that don't match the scheme are dropped. (Movies fall back to a
  TMDB title+year search when no `tmdb://` guid is present.)
- Plex items missing the match id are skipped with a recorded reason (title +
  why), surfaced in the job result.
- Existing items are skipped on movie sync (no overwrite). TV sync adds new
  seasons/episodes to an existing show but skips ones already present.
- Watch events from sync are written with `source='plex_sync'`; `watchedAt` is
  the Plex last-viewed timestamp, not sync time.
- `source='plex_sync'` watch events do NOT trigger watchlist auto-removal — the
  guard is `completed === 1 && source !== 'plex_sync'` in `logWatch`. Manual
  watches still auto-remove.
- Sync is idempotent: the `(media_type, media_id, watched_at)` unique index plus
  a ±5-minute near-duplicate check make repeated runs safe (a duplicate insert
  is silently skipped, not an error).
- Auth token persists only in `plex_settings` (encrypted), never in env/config.
- Each item's sync is wrapped in try/catch — one failure does not abort the run.
- Scheduler is a module-level singleton driving a recursive `setTimeout` (next
  tick armed only after the current resolves — no pile-up). State persists in
  `plex_settings`; `resumeIfEnabled` restarts it on server boot if enabled. A
  tick syncs movies + TV + watchlist only.

## Frontend

The Plex settings UI is the generic settings panel `media.plex` (route
`/media/plex` redirects to `/settings#media.plex`), with groups:

- **Connection**: `plex_url` (URL field) + `plex_token` (password, sensitive)
  with a "Test Connection" action bound to `media.plex.testConnection`.
- **Library**: `plex_movie_section_id` + `plex_tv_section_id` text fields.
- **Sync**: `plex_scheduler_enabled` toggle + `plex_scheduler_interval_ms` duration.

`WatchlistPlexSyncButton` (watchlist page header) fires the `plexSyncWatchlist`
job, reflects running state, and invalidates the watchlist query on completion.

A separate "Plex Sync" operational settings group exposes tuning knobs:
`media.plex.rateLimitDelayMs`, `media.plex.clientPageSize`,
`media.plex.friendsPageSize`.

## Acceptance Criteria

Auth + connection

- [x] `POST /plex/auth/pin` requests a PIN from plex.tv and returns `{ id, code, clientId }`; the client identifier persists in `plex_settings` across sessions.
- [x] `POST /plex/auth/pin/check` polls plex.tv; on claim it extracts the token, persists it AES-256-GCM-encrypted, and records `plex_username`. Returns `{ connected, username?, expired? }`.
- [x] Token encryption/decryption round-trips via `encryptToken`/`decryptToken` with key from env/seed (`crypto.test.ts`).
- [x] `POST /plex/disconnect` clears token + username; auth-gated calls then 409 ("Plex is not configured").
- [x] An expired PIN yields `expired: true`; an unknown PIN id maps to a not-found error.
- [x] `POST /plex/url` validates reachability before persisting; `GET /plex/test-connection` returns `{ connected, error? }` (false + message on failure, never throws for an unreachable server).
- [x] `GET /plex/libraries` lists sections; `GET /plex/sync-status` reports `{ configured, hasUrl, hasToken, connected }`.

Library sync

- [x] `POST /plex/sync` with `plexSyncMovies` paginates the section, extracts TMDB id from the Guid array, matches by TMDB id, creates new movies via TMDB enrichment, skips existing.
- [x] `plexSyncTvShows` extracts TheTVDB id, matches by it, creates show→season→episode via TheTVDB, and adds only new seasons/episodes to existing shows.
- [x] Items missing the match id are skipped with title + reason in the result; per-item try/catch isolates failures; results carry synced/skipped/errors.
- [x] Repeated identical syncs produce identical results (idempotent).
- [x] `startSyncJob` returns `{ jobId }` immediately and runs async; `getSyncJobStatus` / `getActiveSyncJobs` / `getLastSyncResults` expose progress and outcome.

Watch history sync

- [x] Movie/episode watches detected during sync are logged with `source='plex_sync'` and `watchedAt` = Plex last-viewed time.
- [x] `plex_sync` watch events skip watchlist auto-removal; manual watches still auto-remove.
- [x] The `(media_type, media_id, watched_at)` unique index plus ±5-min near-duplicate check make duplicate inserts a silent no-op, not an error.
- [x] `plexSyncWatchHistory` re-syncs already-imported media and returns per-show diagnostics (matched vs not-found episodes, gap detection against Plex `viewedLeafCount`) and movie counts (watched/logged/alreadyLogged/noLocalMatch).

Scheduler

- [x] `POST /plex/scheduler/start` arms the periodic timer, fires one tick immediately, and persists enabled + interval.
- [x] `POST /plex/scheduler/stop` clears the timer and persists disabled.
- [x] `GET /plex/scheduler/status` returns run state, interval, last/next sync time, last error, and last movie/TV counts.
- [x] An enabled scheduler resumes on server boot (`resumeIfEnabled`).
- [x] `GET /plex/scheduler/sync-logs` lists recent runs newest-first with counts, errors, and duration.

## Edge Cases

| Case                               | Behaviour                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Plex server unreachable            | `test-connection` returns `{ connected: false, error }`; sync jobs fail and the job row records the error |
| Item missing TMDB/TheTVDB id       | Skipped with title + reason in the job result                                                             |
| Token absent / disconnected        | Auth-gated routes 409 "Plex is not configured"                                                            |
| Sync interrupted mid-run           | Each item is its own transaction; re-sync is safe                                                         |
| Duplicate Plex copy (same TMDB id) | Second skipped (match exists)                                                                             |
| Show with missing episodes         | Present episodes synced; absent ones ignored                                                              |
| Scheduler enabled across restart   | Resumes on boot from `plex_settings`                                                                      |
| PIN expires before claim           | `check` returns `expired: true`                                                                           |

## Out of Scope

- Plex webhooks (requires Plex Pass).
- Continue-watching / in-progress tracking from Plex.
- Plex user-rating import.
- Multi-user Plex (single user only).
- Bidirectional watchlist sync with Plex Discover — see
  [ideas/plex-watchlist-push.md](../../ideas/plex-watchlist-push.md).
