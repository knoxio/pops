# Source Lists

Status: Done. Source plugins, candidate queue, exclusion list, weighted selection, and per-source interval sync are all shipped. Deferred ideas (candidate staleness, per-candidate contributing-source tracking, type-based default priorities) live in [docs/ideas/source-lists-staleness-and-priorities.md](../../ideas/source-lists-staleness-and-priorities.md).

Source lists define where candidate movies come from. Each source is a plugin that fetches movies from an external list (the user's Plex watchlist, a friend's watchlist, TMDB top-rated, a Letterboxd list) into a unified candidate queue. A weighted-random selection policy picks from the queue using source priority and movie rating; an exclusion list blocks specific movies from ever being added. The [rotation cycle](../rotation-engine/README.md) drives sync + selection each tick.

## Data Model

All tables live in the media pillar's own SQLite DB.

### `rotation_sources`

| Column                | Type        | Default           | Notes                                                                                   |
| --------------------- | ----------- | ----------------- | --------------------------------------------------------------------------------------- |
| `id`                  | integer PK  | auto-increment    |                                                                                         |
| `type`                | text        | —                 | adapter key: `plex_watchlist`, `plex_friends`, `tmdb_top_rated`, `letterboxd`, `manual` |
| `name`                | text        | —                 | display name                                                                            |
| `priority`            | integer     | `5`               | 1-10; higher = more likely to be selected                                               |
| `enabled`             | integer     | `1`               | boolean-as-int                                                                          |
| `config`              | text (JSON) | `null`            | source-specific config (friend uuid, list url, page count)                              |
| `last_synced_at`      | text        | `null`            | ISO datetime of last sync                                                               |
| `sync_interval_hours` | integer     | `24`              | re-fetch cadence                                                                        |
| `created_at`          | text        | `datetime('now')` |                                                                                         |

Indexed on `type`.

### `rotation_candidates`

| Column          | Type       | Default           | Notes                                             |
| --------------- | ---------- | ----------------- | ------------------------------------------------- |
| `id`            | integer PK | auto-increment    |                                                   |
| `source_id`     | integer FK | —                 | → `rotation_sources.id`, `ON DELETE CASCADE`      |
| `tmdb_id`       | integer    | —                 | **unique** — one queue row per movie              |
| `title`         | text       | —                 | denormalised for list display without TMDB lookup |
| `year`          | integer    | `null`            |                                                   |
| `rating`        | real       | `null`            | 0-10 scale                                        |
| `poster_path`   | text       | `null`            |                                                   |
| `status`        | text       | `'pending'`       | `pending` \| `added` \| `skipped` \| `excluded`   |
| `discovered_at` | text       | `datetime('now')` |                                                   |

Indexed on `source_id`, `status`, and uniquely on `tmdb_id`. Because `tmdb_id` is unique, a movie occupies exactly one candidate row regardless of how many sources surface it; the first-inserting source owns the row and re-syncs of the same id are no-ops (`ON CONFLICT DO NOTHING`).

### `rotation_exclusions`

| Column        | Type       | Default           | Notes                                                          |
| ------------- | ---------- | ----------------- | -------------------------------------------------------------- |
| `id`          | integer PK | auto-increment    |                                                                |
| `tmdb_id`     | integer    | —                 | **unique**                                                     |
| `title`       | text       | —                 | resolved from candidate/movie row, falls back to the id string |
| `reason`      | text       | `null`            | optional user note                                             |
| `excluded_at` | text       | `datetime('now')` |                                                                |

## Source Plugin Interface

```ts
interface RotationSourceAdapter {
  readonly type: string;
  fetchCandidates(
    config: Record<string, unknown>,
    deps: { plexToken: string | null; plexClientId: string | null }
  ): Promise<CandidateMovie[]>;
}

interface CandidateMovie {
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
}
```

Adapters are pure fetch+map units — persistence lives in the sync orchestration, not the adapter. A module-level registry maps `type` → adapter; built-in adapters self-register idempotently. Plex-dependent collaborators (`plexToken`, `plexClientId`) are resolved per-sync and passed in, so adapters stay db- and HTTP-client-free.

Shipped adapters:

- **`plex_watchlist`** — the user's own Plex Discover watchlist. Skips TV; extracts `tmdb` from the Plex `Guid` array; maps audience/critic rating and thumb. Throws if Plex is unconfigured.
- **`plex_friends`** — a friend's shared watchlist. Config `{ friendUuid, friendUsername? }`. Degrades to an empty array (logged warning) on access errors. One source per friend, each with its own priority/interval.
- **`tmdb_top_rated`** — TMDB discover sorted by `vote_average.desc` with `vote_count >= 500`. Config `{ pages? }` (default 5, max 25); paginates to `total_pages`. Returns `[]` if TMDB is unconfigured or a page fetch fails.
- **`letterboxd`** — scrapes a Letterboxd list (`{ listUrl }`), reading `data-tmdb-id` straight off film poster elements (no external id resolution). Follows `next` pagination up to 20 pages; returns `[]` on first-page failure, partial results on later-page failure.

## REST API Surface

Contract: `rotation.*` under the media pillar (ts-rest / zod).

Candidates:

- `POST /rotation/candidates` — add a movie to the queue under the lazily-created `manual` source.
- `GET /rotation/candidates` — list with `status` filter (default `pending`), title `search`, `limit`/`offset`; rows carry `sourceName` + `sourcePriority`.
- `GET /rotation/candidates/status/:tmdbId` — `{ inQueue, candidateId, candidateStatus, isExcluded }` for a movie.
- `POST /rotation/candidates/:candidateId/download` — add to Radarr, create/enrich the library row, mark `added`, set library `rotationStatus='protected'`.
- `DELETE /rotation/candidates/:tmdbId` — remove a `pending` candidate.

Exclusions:

- `POST /rotation/exclusions` — exclude `{ tmdbId, reason? }`; flips any matching candidate to `excluded`.
- `GET /rotation/exclusions` — paginated, most-recent first.
- `GET /rotation/exclusions/:tmdbId` — one entry or `null`.
- `DELETE /rotation/exclusions/:tmdbId` — un-exclude; resets any matching candidate to `pending`.

Sources:

- `GET /rotation/source-types` — registered adapter type strings (for the source-config UI picker).
- `GET /rotation/plex-friends` — Plex friends list for the `plex_friends` picker; `{ friends, error }`, degrading to empty when Plex is unconfigured.
- `GET /rotation/sources` — sources with `candidateCount`, highest priority first.
- `POST /rotation/sources` — create.
- `PATCH /rotation/sources/:id` — update name/priority/enabled/config/interval.
- `POST /rotation/sources/:id/sync` — sync one source now.
- `DELETE /rotation/sources/:id` — delete source + cascade its candidates (the `manual` source is protected from deletion).

## Business Rules

- **Weighted selection.** `aggregateCandidates(count)` picks `count` `pending` candidates by weighted random sampling without replacement. Per-candidate weight = `source_priority × (rating / 10)`; a null rating uses `source_priority × 0.5`. A missing source priority falls back to `5`.
- **Dedup at selection.** If several rows share a `tmdb_id` (only possible across re-keyed history, since the unique index normally prevents it), the highest source priority wins. The unique `tmdb_id` index means the queue is already deduped at write time.
- **Library + exclusion filtering.** Before sampling, candidates whose `tmdb_id` is already in the `movies` library table, or on `rotation_exclusions`, are dropped from the eligible pool.
- **Exclusion at sync time.** When a synced movie is on the exclusion list, it is persisted with `status='excluded'` instead of `pending`. Exclusion entries survive re-syncs.
- **Manual queue.** "Add to Queue" inserts under a singleton `manual` source (lazily created `{ name: 'Manual Queue', priority: 5, enabled: 1 }` on first use). Re-adding an already-queued movie is a no-op; adding an excluded movie is rejected.
- **Direct download bypass.** "Download" skips the queue: adds to Radarr (`searchForMovie`), builds/enriches the library row, and sets `rotationStatus='protected'` (see the [rotation engine](../rotation-engine/README.md)) so the movie is exempt from the removal phase.
- **Per-source interval sync.** `syncAllSources` runs every enabled source whose `last_synced_at + sync_interval_hours` has elapsed (or that has never synced). Each source syncs independently — one failure never blocks others; errors are collected, not thrown. A module-level guard prevents concurrent syncs of the same source. `last_synced_at` is touched after a successful sync. Source sync runs at the start of each rotation cycle, before the addition phase.
- **Sync resilience.** A failed sync logs and retries next interval; existing candidates are never purged on failure.

## Edge Cases

| Case                                            | Behaviour                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Source returns 0 candidates                     | `last_synced_at` is still touched; nothing inserted                  |
| All candidates already in library/excluded      | Selection returns empty; no additions that cycle                     |
| Source deleted with candidates pending          | Candidates cascade-deleted (manual source cannot be deleted)         |
| Same movie excluded then un-excluded            | Exclusion row removed; matching candidate resets to `pending`        |
| Movie already on exclusion list at add-to-queue | `addToQueue` rejected with a domain error                            |
| Plex unconfigured / friend watchlist private    | Adapter degrades to `[]` (or throws for own watchlist), source stays |

## Acceptance Criteria

- [x] `rotation_sources`, `rotation_candidates`, `rotation_exclusions` tables exist with the columns above; `rotation_candidates.tmdb_id` and `rotation_exclusions.tmdb_id` are uniquely indexed; `rotation_candidates.source_id` is an FK with cascade delete.
- [x] `RotationSourceAdapter` plugin interface + `CandidateMovie` type are defined; a registry maps `type` → adapter and built-in adapters self-register idempotently.
- [x] `plex_watchlist` adapter fetches the user's Plex Discover watchlist, skips TV, extracts the TMDB id from the Plex `Guid` array, and maps title/year/rating/poster.
- [x] `plex_friends` adapter takes `friendUuid` in config, fetches the friend's watchlist, returns movies only, and returns `[]` (logged) when the watchlist is inaccessible. Multiple friend sources coexist with independent priority/interval.
- [x] `tmdb_top_rated` adapter fetches top-rated movies via TMDB discover with a vote-count floor, paginates, and degrades to `[]` when TMDB is unconfigured or a page fails.
- [x] `letterboxd` adapter scrapes a list URL for embedded `data-tmdb-id`s, paginates via the `next` link, and degrades gracefully on fetch errors.
- [x] `syncSource(sourceId)` fetches via the adapter and upserts into `rotation_candidates` (insert new, skip existing by `tmdb_id`), touching `last_synced_at`.
- [x] `aggregateCandidates(count)` selects `pending` candidates by weighted sampling without replacement using `source_priority × (rating/10)` (null rating → `× 0.5`), filtering out library and excluded `tmdb_id`s.
- [x] Exclusion CRUD works: excluding flips the candidate to `excluded`; un-excluding resets it to `pending`; excluded ids are filtered during both selection and sync.
- [x] `syncAllSources` gates each source by its interval, runs them independently, prevents concurrent same-source syncs, and is invoked from the rotation cycle before additions.
- [x] `GET /rotation/source-types` and `GET /rotation/plex-friends` back the source-config UI; the SPA exposes source management, the candidate queue, and the exclusion list.
- [x] The manual queue source is singleton + protected from deletion; "Add to Queue" and "Download" behave per the rules above.

## Out of Scope

- Streaming-availability checking
- Taste-profile source recommendations
- Cross-user social/list sharing
- TV-show sources
