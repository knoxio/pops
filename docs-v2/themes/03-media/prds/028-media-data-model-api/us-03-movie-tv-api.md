# US-03: Movie and TV show API

> PRD: [028 — Media Data Model & API](README.md)
> Status: To Review

## Description

As a developer, I want tRPC CRUD procedures for movies and TV shows (including seasons and episodes) so that media metadata can be created, read, updated, and deleted via the API.

## Acceptance Criteria

- [ ] `media.movies.list` — paginated (limit/offset), filterable by search (title) and genre, ordered by releaseDate DESC
- [ ] `media.movies.get` — returns single movie by id, 404 if not found
- [ ] `media.movies.create` — requires tmdbId and title, sets createdAt/updatedAt, returns created movie
- [ ] `media.movies.update` — partial update by id, updates only provided fields plus updatedAt
- [ ] `media.movies.delete` — removes movie by id, 404 if not found
- [ ] `media.tvShows.list` — paginated, filterable by search (name) and status, ordered by name ASC
- [ ] `media.tvShows.get` — returns single TV show by id, 404 if not found
- [ ] `media.tvShows.create` — requires tvdbId and name, sets createdAt/updatedAt, returns created show
- [ ] `media.tvShows.update` — partial update by id, updates only provided fields plus updatedAt
- [ ] `media.tvShows.delete` — removes show by id (cascades to seasons/episodes), 404 if not found
- [ ] `media.tvShows.listSeasons` — returns all seasons for a tvShowId, ordered by seasonNumber ASC
- [ ] `media.tvShows.createSeason` — requires tvShowId, tvdbId, seasonNumber; validates tvShowId exists
- [ ] `media.tvShows.deleteSeason` — removes season by id (cascades to episodes)
- [ ] `media.tvShows.listEpisodes` — returns all episodes for a seasonId, ordered by episodeNumber ASC
- [ ] `media.tvShows.createEpisode` — requires seasonId, tvdbId, episodeNumber; validates seasonId exists
- [ ] `media.tvShows.deleteEpisode` — removes episode by id
- [ ] Input validation on all procedures (zod schemas)
- [ ] Pagination returns total count alongside data
- [ ] Genres are parsed from JSON on read and serialized on write
- [ ] Tests cover CRUD operations, filtering, pagination, cascade deletes, and 404 cases

## Notes

Movie and TV show routers are nested under `media.movies` and `media.tvShows` per [ADR-014](../../../../architecture/adr-014-trpc.md). Season and episode procedures are sub-routes of tvShows since they are tightly coupled to the TV hierarchy. Genres are stored as JSON arrays in the database — parse them into typed arrays when returning to the client.
