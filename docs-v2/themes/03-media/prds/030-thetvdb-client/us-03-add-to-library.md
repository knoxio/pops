# US-03: Add TV show to library flow

> PRD: [030 — TheTVDB Client](README.md)
> Status: Done

## Description

As a user, I want to add a TV show to my library by TheTVDB ID so that the full show hierarchy (show, all seasons, all episodes) is fetched, images are cached, and all records are created in one operation.

## Acceptance Criteria

### addTvShow

- [x] `media.library.addTvShow(tvdbId)` tRPC procedure orchestrates: fetch show metadata, fetch all seasons, fetch all episodes per season, create all records in database, download show and season posters
- [x] Idempotent: if a show with the given tvdbId already exists in the database, return the existing record without re-fetching or re-downloading
- [x] TV show record created with all fields from TheTVDB: tvdbId, name, originalName, overview, firstAirDate, lastAirDate, status, originalLanguage, numberOfSeasons, numberOfEpisodes, episodeRunTime, voteAverage, voteCount, genres, networks
- [x] All seasons created with: tvShowId (FK), tvdbId, seasonNumber, name, overview, posterPath, airDate, episodeCount
- [x] Specials season (seasonNumber 0) included when present
- [x] All episodes created with: seasonId (FK), tvdbId, episodeNumber, name, overview, airDate, voteAverage, runtime
- [x] Episodes without an air date are still created (upcoming episodes)
- [x] Show poster and all season posters downloaded to local cache
- [x] If any image download fails, records are still created with null image paths
- [x] `createdAt` set on show, all seasons, and all episodes
- [x] Returns the complete TV show record

### refreshTvShow

- [x] `media.library.refreshTvShow(id, redownloadImages?, refreshEpisodes?)` tRPC procedure re-fetches metadata from TheTVDB and updates database records
- [x] Looks up the show's tvdbId from the existing record, then fetches fresh details
- [x] Updates show metadata fields from the fresh TheTVDB response
- [x] When `refreshEpisodes` is true (default), fetches all seasons and episodes and compares against existing records
- [x] New seasons are inserted (not present in DB by tvdbId)
- [x] Existing seasons are updated with fresh metadata
- [x] New episodes are inserted (not present in DB by tvdbId)
- [x] Existing episodes are updated with fresh metadata
- [x] No records are deleted during refresh — existing seasons/episodes are preserved to maintain watch history references
- [x] When `redownloadImages` is true, re-downloads show and season posters
- [x] Returns `{ data: TvShow, diff: RefreshDiff }` where diff reports seasonsAdded, seasonsUpdated, episodesAdded, episodesUpdated
- [x] Returns 404 if show id does not exist in the database

### Cross-cutting

- [x] All TheTVDB API calls go through the JWT auth layer
- [x] Tests cover: addTvShow happy path (show with multiple seasons and episodes), addTvShow idempotency, addTvShow with image failure, refreshTvShow with new season added, refreshTvShow with new episode in existing season, refreshTvShow diff accuracy, refreshTvShow 404

## Notes

The add flow involves multiple sequential API calls to TheTVDB (show details, then seasons list, then episodes per season). For a show with 5 seasons, this is roughly 7 API calls. The JWT auth layer handles any token expiry transparently. The refresh flow performs an upsert pattern — match by tvdbId, insert if new, update if existing. The diff is calculated by counting inserts vs updates during the upsert loop.
