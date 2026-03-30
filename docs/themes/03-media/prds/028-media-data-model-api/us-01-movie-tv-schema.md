# US-01: Movie and TV schema

> PRD: [028 — Media Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want the movies, tv_shows, seasons, and episodes tables with proper indexes and FK cascades so that media metadata can be stored with enforced TV hierarchy.

## Acceptance Criteria

- [x] `movies` table created with all columns per the data model (id, tmdbId, imdbId, title, originalTitle, overview, tagline, releaseDate, runtime, status, originalLanguage, budget, revenue, posterPath, backdropPath, logoPath, posterOverridePath, voteAverage, voteCount, genres, createdAt, updatedAt)
- [x] `movies` indexes on: tmdbId (UNIQUE), title, releaseDate
- [x] `tv_shows` table created with all columns per the data model (id, tvdbId, name, originalName, overview, firstAirDate, lastAirDate, status, originalLanguage, numberOfSeasons, numberOfEpisodes, episodeRunTime, posterPath, backdropPath, logoPath, posterOverridePath, voteAverage, voteCount, genres, networks, createdAt, updatedAt)
- [x] `tv_shows` indexes on: tvdbId (UNIQUE), name, firstAirDate
- [x] `seasons` table created with FK to tv_shows(id) ON DELETE CASCADE (id, tvShowId, tvdbId, seasonNumber, name, overview, posterPath, airDate, episodeCount, createdAt)
- [x] `seasons` indexes on: tvdbId (UNIQUE), (tvShowId + seasonNumber) UNIQUE composite, tvShowId
- [x] `episodes` table created with FK to seasons(id) ON DELETE CASCADE (id, seasonId, tvdbId, episodeNumber, name, overview, airDate, stillPath, voteAverage, runtime, createdAt)
- [x] `episodes` indexes on: tvdbId (UNIQUE), (seasonId + episodeNumber) UNIQUE composite, seasonId
- [x] Deleting a tv_show cascades to all its seasons and episodes
- [x] Deleting a season cascades to all its episodes
- [x] `seasonNumber` 0 is allowed (specials)
- [x] `genres` column defaults to '[]' and stores valid JSON arrays
- [x] Tests verify table creation, FK cascade behaviour, unique constraint enforcement, and index existence

## Notes

Per [ADR-008](../../../../architecture/adr-008-media-split-tables.md), movies and TV shows use separate tables rather than a unified media_items table. The TV hierarchy (show > season > episode) is enforced at the database level via foreign keys with CASCADE deletes. All PKs are auto-increment integers.
