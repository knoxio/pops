# Epic: Data Model & API Module

**Theme:** Media
**Priority:** 0 (prerequisite to everything)
**Status:** Done

## Goal

Design and implement the SQLite schema for the media domain and register the media tRPC router module in pops-api, following the patterns established in Foundation Epic 3 (API Modularisation) and Epic 4 (DB Schema Patterns).

## Why first?

Every other epic — TMDB integration, UI, tracking, comparisons, recommendations, Plex sync — reads from or writes to these tables. The schema is the foundation. Getting it wrong means migrations later.

## Scope

### In scope

- Create `movies` table — TMDB metadata (title, overview, release_date, runtime, poster_path, backdrop_path, vote_average, vote_count, genres, tmdb_id, imdb_id, tagline, status, original_language, budget, revenue)
- Create `tv_shows` table — TheTVDB metadata (name, overview, first_air_date, last_air_date, number_of_seasons, number_of_episodes, poster_path, backdrop_path, vote_average, vote_count, genres, tvdb_id, status, original_language, networks, episode_run_time)
- Create `seasons` table — FK to tv_shows (season_number, name, overview, poster_path, air_date, tvdb_id, episode_count)
- Create `episodes` table — FK to seasons (episode_number, name, overview, air_date, still_path, tvdb_id, vote_average, runtime)
- Create `watchlist` table — polymorphic reference to movie or tv_show (media_type discriminator + media_id), added_at, priority, notes
- Create `watch_history` table — tracks individual watch events (media_type + media_id for movies, episode_id for TV, watched_at, completed)
- Create `comparison_dimensions` table — configurable taste dimensions (name, description, active, sort_order)
- Create `comparisons` table — individual 1v1 comparison results (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_id, compared_at)
- Create `media_scores` table — derived ELO-style scores per media item per dimension (media_type, media_id, dimension_id, score, comparison_count)
- Seed default comparison dimensions
- Create migration files following Foundation Epic 4 conventions
- Create `media/` module in `apps/pops-api/src/modules/` with tRPC routers:
  - `media/movies/` — CRUD for movies
  - `media/tv-shows/` — CRUD for shows, seasons, episodes
  - `media/watchlist/` — add/remove/list watchlist
  - `media/watch-history/` — log/query watch events
  - `media/comparisons/` — record comparisons, query scores
- Register media router in the top-level tRPC app router
- TypeScript types for all tables in `@pops/db-types`

### Out of scope

- TMDB API calls (Epic 1)
- Poster file storage (Epic 1)
- Plex-specific fields or sync tables (Epic 6)
- Radarr/Sonarr-specific fields (Epic 7)
- Recommendation algorithm tables (Epic 5 — uses media_scores from comparisons)
- UI components

## Deliverables

1. Migration files create all media tables with proper indexes and foreign keys
2. `@pops/db-types` exports TypeScript types for all media tables
3. `media/` module exists in pops-api with tRPC routers for each sub-domain
4. Media router composes into the top-level app router
5. Default comparison dimensions seeded (specific dimensions TBD in PRD)
6. All tRPC procedures have input validation (zod schemas)
7. Unit tests for router procedures (CRUD operations, validation)
8. `pnpm typecheck` passes across all packages
9. Migrations are idempotent and reversible
10. `mise db:seed` updated with media test data — ~10 movies, ~3 TV shows (with seasons/episodes), covering diverse genres and metadata

## Target Schema

```
movies
  id              INTEGER PRIMARY KEY
  tmdb_id         INTEGER UNIQUE NOT NULL
  imdb_id         TEXT
  title           TEXT NOT NULL
  original_title  TEXT
  overview        TEXT
  tagline         TEXT
  release_date    TEXT
  runtime         INTEGER
  status          TEXT
  original_language TEXT
  budget          INTEGER
  revenue         INTEGER
  poster_path     TEXT
  backdrop_path   TEXT
  logo_path       TEXT
  poster_override_path TEXT
  vote_average    REAL
  vote_count      INTEGER
  genres          TEXT  (JSON array)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))

tv_shows
  id              INTEGER PRIMARY KEY
  tvdb_id         INTEGER UNIQUE NOT NULL
  name            TEXT NOT NULL
  original_name   TEXT
  overview        TEXT
  first_air_date  TEXT
  last_air_date   TEXT
  status          TEXT
  original_language TEXT
  number_of_seasons  INTEGER
  number_of_episodes INTEGER
  episode_run_time   INTEGER
  poster_path     TEXT
  backdrop_path   TEXT
  logo_path       TEXT
  poster_override_path TEXT
  vote_average    REAL
  vote_count      INTEGER
  genres          TEXT  (JSON array)
  networks        TEXT  (JSON array)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))

seasons
  id              INTEGER PRIMARY KEY
  tv_show_id      INTEGER NOT NULL REFERENCES tv_shows(id) ON DELETE CASCADE
  tvdb_id         INTEGER UNIQUE NOT NULL
  season_number   INTEGER NOT NULL
  name            TEXT
  overview        TEXT
  poster_path     TEXT
  air_date        TEXT
  episode_count   INTEGER
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  UNIQUE(tv_show_id, season_number)

episodes
  id              INTEGER PRIMARY KEY
  season_id       INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE
  tvdb_id         INTEGER UNIQUE NOT NULL
  episode_number  INTEGER NOT NULL
  name            TEXT
  overview        TEXT
  air_date        TEXT
  still_path      TEXT
  vote_average    REAL
  runtime         INTEGER
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  UNIQUE(season_id, episode_number)

watchlist
  id              INTEGER PRIMARY KEY
  media_type      TEXT NOT NULL CHECK(media_type IN ('movie', 'tv_show'))
  media_id        INTEGER NOT NULL
  priority        INTEGER DEFAULT 0
  notes           TEXT
  added_at        TEXT NOT NULL DEFAULT (datetime('now'))
  UNIQUE(media_type, media_id)

watch_history
  id              INTEGER PRIMARY KEY
  media_type      TEXT NOT NULL CHECK(media_type IN ('movie', 'episode'))
  media_id        INTEGER NOT NULL
  watched_at      TEXT NOT NULL DEFAULT (datetime('now'))
  completed       INTEGER NOT NULL DEFAULT 1

comparison_dimensions
  id              INTEGER PRIMARY KEY
  name            TEXT NOT NULL UNIQUE
  description     TEXT
  active          INTEGER NOT NULL DEFAULT 1
  sort_order      INTEGER NOT NULL DEFAULT 0
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))

comparisons
  id              INTEGER PRIMARY KEY
  dimension_id    INTEGER NOT NULL REFERENCES comparison_dimensions(id)
  media_a_type    TEXT NOT NULL CHECK(media_a_type IN ('movie', 'tv_show'))
  media_a_id      INTEGER NOT NULL
  media_b_type    TEXT NOT NULL CHECK(media_b_type IN ('movie', 'tv_show'))
  media_b_id      INTEGER NOT NULL
  winner_type     TEXT NOT NULL CHECK(winner_type IN ('movie', 'tv_show'))
  winner_id       INTEGER NOT NULL
  compared_at     TEXT NOT NULL DEFAULT (datetime('now'))

media_scores
  id              INTEGER PRIMARY KEY
  media_type      TEXT NOT NULL CHECK(media_type IN ('movie', 'tv_show'))
  media_id        INTEGER NOT NULL
  dimension_id    INTEGER NOT NULL REFERENCES comparison_dimensions(id)
  score           REAL NOT NULL DEFAULT 1500.0
  comparison_count INTEGER NOT NULL DEFAULT 0
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  UNIQUE(media_type, media_id, dimension_id)
```

## Dependencies

- Foundation Epic 3 (API Modularisation) — media module follows the `modules/media/` pattern
- Foundation Epic 4 (DB Schema Patterns) — migrations follow established conventions

## Risks

- **Schema churn** — Getting the schema wrong now means migrations later. Mitigation: the PRD should include concrete queries for each user flow to validate the schema supports them before implementation.
- **Polymorphic references** — `media_type + media_id` pattern (watchlist, comparisons, scores) doesn't enforce FK constraints at the database level. Mitigation: application-level validation in tRPC procedures. This is a known SQLite trade-off — the alternative (separate join tables per type) adds complexity for minimal benefit at this scale.
- **Genre storage as JSON** — Storing genres as a JSON array means no FK-based queries. Mitigation: genres are TMDB-sourced reference data, not user-managed. JSON is fine for filtering and display. If genre-based queries become a bottleneck, extract to a junction table later.
