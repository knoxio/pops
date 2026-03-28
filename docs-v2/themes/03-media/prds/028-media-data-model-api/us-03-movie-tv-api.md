# US-03: Movie and TV show API

> PRD: [028 — Media Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want tRPC CRUD procedures for movies and TV shows (including seasons and episodes) so that media metadata can be created, read, updated, and deleted via the API.

## Acceptance Criteria

- [x] `media.movies.list` — paginated (limit/offset), filterable by search (title) and genre, ordered by releaseDate DESC
- [x] `media.movies.get` — returns single movie by id, 404 if not found
- [x] `media.movies.create` — requires tmdbId and title, sets createdAt/updatedAt, returns created movie
- [x] `media.movies.update` — partial update by id, updates only provided fields plus updatedAt
- [x] `media.movies.delete` — removes movie by id, 404 if not found
- [x] `media.tvShows.list` — paginated, filterable by search (name) and status, ordered by name ASC
- [x] `media.tvShows.get` — returns single TV show by id, 404 if not found
- [x] `media.tvShows.create` — requires tvdbId and name, sets createdAt/updatedAt, returns created show
- [x] `media.tvShows.update` — partial update by id, updates only provided fields plus updatedAt
- [x] `media.tvShows.delete` — removes show by id (cascades to seasons/episodes), 404 if not found
- [x] `media.tvShows.listSeasons` — returns all seasons for a tvShowId, ordered by seasonNumber ASC
- [x] `media.tvShows.createSeason` — requires tvShowId, tvdbId, seasonNumber; validates tvShowId exists
- [x] `media.tvShows.deleteSeason` — removes season by id (cascades to episodes)
- [x] `media.tvShows.listEpisodes` — returns all episodes for a seasonId, ordered by episodeNumber ASC
- [x] `media.tvShows.createEpisode` — requires seasonId, tvdbId, episodeNumber; validates seasonId exists
- [x] `media.tvShows.deleteEpisode` — removes episode by id
- [x] Input validation on all procedures (zod schemas)
- [x] Pagination returns total count alongside data
- [x] Genres are parsed from JSON on read and serialized on write
- [x] Tests cover CRUD operations, filtering, pagination, cascade deletes, and 404 cases

## Notes

Movie and TV show routers are nested under `media.movies` and `media.tvShows` per [ADR-014](../../../../architecture/adr-014-trpc.md). Season and episode procedures are sub-routes of tvShows since they are tightly coupled to the TV hierarchy. Genres are stored as JSON arrays in the database — parse them into typed arrays when returning to the client.
