/**
 * SQL fixtures for the media-pillar backfill suite. Split out of
 * `backfill-test-fixtures.ts` to keep each file under the 200-line cap.
 * See that module's header for why these DDLs live alongside the tests.
 */
export const SHELF_IMPRESSIONS_TABLE_SQL = `
CREATE TABLE shelf_impressions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  shelf_id text NOT NULL,
  shown_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_shelf_impressions_shelf_id ON shelf_impressions (shelf_id);
`;

export const MOVIES_TABLE_SQL = `
CREATE TABLE movies (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  tmdb_id integer NOT NULL,
  imdb_id text,
  title text NOT NULL,
  original_title text,
  overview text,
  tagline text,
  release_date text,
  runtime integer,
  status text,
  original_language text,
  budget integer,
  revenue integer,
  poster_path text,
  backdrop_path text,
  logo_path text,
  poster_override_path text,
  discover_rating_key text,
  vote_average real,
  vote_count integer,
  genres text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL,
  rotation_status text,
  rotation_expires_at text,
  rotation_marked_at text
);
CREATE INDEX idx_movies_rotation_status ON movies (rotation_status);
CREATE UNIQUE INDEX idx_movies_tmdb_id ON movies (tmdb_id);
CREATE INDEX idx_movies_title ON movies (title);
CREATE INDEX idx_movies_release_date ON movies (release_date);
`;

export const TV_SHOWS_TABLE_SQL = `
CREATE TABLE tv_shows (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  tvdb_id integer NOT NULL,
  name text NOT NULL,
  original_name text,
  overview text,
  first_air_date text,
  last_air_date text,
  status text,
  original_language text,
  number_of_seasons integer,
  number_of_episodes integer,
  episode_run_time integer,
  poster_path text,
  backdrop_path text,
  logo_path text,
  poster_override_path text,
  discover_rating_key text,
  vote_average real,
  vote_count integer,
  genres text,
  networks text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX idx_tv_shows_tvdb_id ON tv_shows (tvdb_id);
CREATE INDEX idx_tv_shows_name ON tv_shows (name);
CREATE INDEX idx_tv_shows_first_air_date ON tv_shows (first_air_date);
`;

export const WATCH_HISTORY_TABLE_SQL = `
CREATE TABLE watch_history (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  media_type text NOT NULL,
  media_id integer NOT NULL,
  watched_at text DEFAULT (datetime('now')) NOT NULL,
  completed integer DEFAULT 1 NOT NULL,
  blacklisted integer DEFAULT 0 NOT NULL
);
CREATE INDEX idx_watch_history_media ON watch_history (media_type, media_id);
CREATE INDEX idx_watch_history_watched_at ON watch_history (watched_at);
CREATE UNIQUE INDEX idx_watch_history_unique ON watch_history (media_type, media_id, watched_at);
`;
