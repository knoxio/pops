# PRD-071: Source Lists

> Epic: [Library Rotation](../../epics/08-library-rotation.md)

## Overview

Source lists define where candidate movies come from. Each source is a plugin that fetches movies from an external list (Plex watchlist, friends' watchlists, IMDB top 100, etc.) and feeds them into a unified candidate queue. A selection policy picks from this queue using weighted randomisation based on source priority and movie rating. An exclusion list prevents specific movies from ever being added.

## Data Model

### `rotation_sources`

| Column                | Type        | Default           | Description                                                                                     |
| --------------------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `id`                  | integer PK  | Auto-increment    |                                                                                                 |
| `type`                | text (enum) | —                 | `'plex_watchlist'`, `'plex_friends'`, `'imdb_top_100'`, `'manual'`, `'letterboxd'` (extensible) |
| `name`                | text        | —                 | Display name (e.g., "João's Plex Watchlist", "IMDB Top 250")                                    |
| `priority`            | integer     | `1`               | Higher = more likely to be selected. Scale: 1-10                                                |
| `enabled`             | boolean     | `true`            |                                                                                                 |
| `config`              | text (JSON) | `'{}'`            | Source-specific config (e.g., friend username, list URL)                                        |
| `last_synced_at`      | text        | `null`            | ISO datetime of last successful sync                                                            |
| `sync_interval_hours` | integer     | `24`              | How often to re-fetch candidates from this source                                               |
| `created_at`          | text        | `datetime('now')` |                                                                                                 |

### `rotation_candidates`

| Column          | Type        | Default           | Description                                       |
| --------------- | ----------- | ----------------- | ------------------------------------------------- |
| `id`            | integer PK  | Auto-increment    |                                                   |
| `source_id`     | integer FK  | —                 | References `rotation_sources.id`                  |
| `tmdb_id`       | integer     | —                 | TMDB movie ID                                     |
| `title`         | text        | —                 | For display without TMDB lookup                   |
| `year`          | integer     | `null`            | Release year                                      |
| `rating`        | real        | `null`            | TMDB/IMDB rating (0-10 scale)                     |
| `poster_path`   | text        | `null`            | TMDB poster path                                  |
| `status`        | text (enum) | `'pending'`       | `'pending'`, `'added'`, `'skipped'`, `'excluded'` |
| `discovered_at` | text        | `datetime('now')` | When the source first returned this movie         |

Unique constraint: `(tmdb_id)` — a movie appears once in the queue regardless of how many sources return it. If multiple sources return the same movie, it inherits the highest source priority.

### `rotation_exclusions`

| Column        | Type       | Default           | Description            |
| ------------- | ---------- | ----------------- | ---------------------- |
| `id`          | integer PK | Auto-increment    |                        |
| `tmdb_id`     | integer    | —                 | TMDB movie ID (unique) |
| `title`       | text       | —                 | For display            |
| `reason`      | text       | `null`            | Optional user note     |
| `excluded_at` | text       | `datetime('now')` |                        |

## API Surface

### Source Sync (internal)

- `syncSource(sourceId)` — fetch candidates from a single source, upsert into `rotation_candidates`
- `syncAllSources()` — sync all enabled sources whose `last_synced_at + sync_interval_hours` has passed
- `aggregateCandidates(count)` → weighted random selection from pending candidates

### Source Plugin Interface

Each source type implements:

```
interface RotationSource {
  type: string
  fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]>
}

interface CandidateMovie {
  tmdbId: number
  title: string
  year: number | null
  rating: number | null
  posterPath: string | null
}
```

### tRPC

- `rotation.sources.list` — all configured sources with sync status
- `rotation.sources.create` — add a new source
- `rotation.sources.update` — edit source (name, priority, config, enabled, interval)
- `rotation.sources.delete` — remove source + its candidates
- `rotation.sources.syncNow(sourceId)` — manually trigger sync for one source
- `rotation.candidates.list` — paginated queue with source info, filterable by status
- `rotation.candidates.exclude(tmdbId)` — move to exclusion list
- `rotation.candidates.addToQueue(tmdbId)` — manually add a movie to the candidate queue (source = `manual`)
- `rotation.exclusions.list` — paginated exclusion list
- `rotation.exclusions.remove(tmdbId)` — un-exclude a movie

## Business Rules

- **Source priority weighting:** When selecting candidates for addition, each candidate's selection weight = `source_priority × (rating / 10)`. A priority-10 source with a 7.5-rated movie has weight `10 × 0.75 = 7.5`. A priority-3 source with a 9.0 movie has weight `3 × 0.9 = 2.7`. The user's watchlist at priority 10 dominates.
- **Default source priorities:** User's Plex watchlist = 10, friends' watchlists = 6, curated external lists (IMDB, Letterboxd) = 3, manual queue = 8.
- **Deduplication:** If multiple sources return the same `tmdb_id`, keep one candidate row. The effective priority is the max priority across all sources that include it. Track contributing sources in a junction table or JSON array.
- **Exclusion filtering:** Before selection, remove any candidate whose `tmdb_id` appears in `rotation_exclusions` or already exists in the `movies` library table.
- **Library filtering:** Candidates already in the POPS library (matched by `tmdb_id`) are skipped during selection. They remain in the candidate table with `status = 'skipped'` so they can re-enter the pool if the movie is later removed.
- **Candidate staleness:** If a source no longer returns a candidate (e.g., movie removed from a friend's watchlist), keep it in the queue for 30 days before marking as `stale`. Stale candidates are deprioritised but not deleted — the source may re-add them.
- **Manual queue:** The "Add to Queue" button creates a candidate with `source_id` pointing to a system-created `manual` source. These have high priority (8) by default.
- **Direct download bypass:** The "Download" button skips the candidate queue entirely. It calls Radarr `addMovie` with `searchForMovie: true` and sets `rotation_status = 'protected'` on the POPS movie record (per PRD-070).
- **Source sync errors:** If a source sync fails (API down, auth expired), log the error, keep existing candidates, retry next interval. Don't purge candidates on sync failure.
- **Rating fallback:** If a candidate has no rating (rare for movies), assign a default weight of `source_priority × 0.5`.

## Edge Cases

| Case                                                        | Behaviour                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Source returns 0 candidates                                 | Log, mark `last_synced_at`, no candidates added                       |
| All candidates already in library                           | Selection returns empty, no additions this cycle                      |
| Source deleted while candidates pending                     | Cascade delete candidates from that source                            |
| Same movie excluded then un-excluded                        | Remove from exclusions, candidate re-enters pool if still present     |
| Candidate added to library, then movie removed from library | Candidate status resets to `pending` on next source sync              |
| TMDB ID changes for a movie                                 | Extremely rare; handled by re-sync matching by title+year as fallback |
| Friend removes movie from their watchlist                   | Candidate stays for 30 days (staleness rule), then deprioritised      |

## User Stories

| #   | Story                                                             | Summary                                                                         | Status      | Parallelisable                    |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------- | --------------------------------- |
| 01  | [us-01-source-schema](us-01-source-schema.md)                     | Schema: `rotation_sources`, `rotation_candidates`, `rotation_exclusions` tables | Not started | Yes (parallel with PRD-070 US-01) |
| 02  | [us-02-source-plugin-interface](us-02-source-plugin-interface.md) | Plugin interface + Plex watchlist adapter                                       | Not started | Blocked by US-01                  |
| 03  | [us-03-plex-friends-source](us-03-plex-friends-source.md)         | Plex friends watchlist source adapter                                           | Done        | Blocked by US-02                  |
| 04  | [us-04-external-list-source](us-04-external-list-source.md)       | IMDB/external list source adapter (web scraping or API)                         | Done        | Blocked by US-02                  |
| 05  | [us-05-selection-policy](us-05-selection-policy.md)               | Weighted random selection from candidate pool                                   | Done        | Blocked by US-01                  |
| 06  | [us-06-exclusion-list](us-06-exclusion-list.md)                   | Exclusion list CRUD + filtering during selection                                | Done        | Blocked by US-01                  |
| 07  | [us-07-source-sync-scheduler](us-07-source-sync-scheduler.md)     | Scheduled source syncing based on per-source intervals                          | Done        | Blocked by US-02                  |

## Out of Scope

- Streaming availability checking (which platform has the movie)
- Source recommendations based on user taste profile
- Social features (sharing lists between POPS users)
- TV show sources
