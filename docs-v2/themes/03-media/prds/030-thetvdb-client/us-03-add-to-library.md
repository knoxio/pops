# US-03: Add TV show to library flow

> PRD: [030 — TheTVDB Client](README.md)
> Status: To Review

## Description

As a user, I want to add a TV show to my library by TheTVDB ID so that the full show hierarchy (show, all seasons, all episodes) is fetched, images are cached, and all records are created in one operation.

## Acceptance Criteria

### addTvShow

- [ ] `media.library.addTvShow(tvdbId)` tRPC procedure orchestrates: fetch show metadata, fetch all seasons, fetch all episodes per season, create all records in database, download show and season posters
- [ ] Idempotent: if a show with the given tvdbId already exists in the database, return the existing record without re-fetching or re-downloading
- [ ] TV show record created with all fields from TheTVDB: tvdbId, name, originalName, overview, firstAirDate, lastAirDate, status, originalLanguage, numberOfSeasons, numberOfEpisodes, episodeRunTime, voteAverage, voteCount, genres, networks
- [ ] All seasons created with: tvShowId (FK), tvdbId, seasonNumber, name, overview, posterPath, airDate, episodeCount
- [ ] Specials season (seasonNumber 0) included when present
- [ ] All episodes created with: seasonId (FK), tvdbId, episodeNumber, name, overview, airDate, voteAverage, runtime
- [ ] Episodes without an air date are still created (upcoming episodes)
- [ ] Show poster and all season posters downloaded to local cache
- [ ] If any image download fails, records are still created with null image paths
- [ ] `createdAt` set on show, all seasons, and all episodes
- [ ] Returns the complete TV show record

### refreshTvShow

- [ ] `media.library.refreshTvShow(id, redownloadImages?, refreshEpisodes?)` tRPC procedure re-fetches metadata from TheTVDB and updates database records
- [ ] Looks up the show's tvdbId from the existing record, then fetches fresh details
- [ ] Updates show metadata fields from the fresh TheTVDB response
- [ ] When `refreshEpisodes` is true (default), fetches all seasons and episodes and compares against existing records
- [ ] New seasons are inserted (not present in DB by tvdbId)
- [ ] Existing seasons are updated with fresh metadata
- [ ] New episodes are inserted (not present in DB by tvdbId)
- [ ] Existing episodes are updated with fresh metadata
- [ ] No records are deleted during refresh — existing seasons/episodes are preserved to maintain watch history references
- [ ] When `redownloadImages` is true, re-downloads show and season posters
- [ ] Returns `{ data: TvShow, diff: RefreshDiff }` where diff reports seasonsAdded, seasonsUpdated, episodesAdded, episodesUpdated
- [ ] Returns 404 if show id does not exist in the database

### Cross-cutting

- [ ] All TheTVDB API calls go through the JWT auth layer
- [ ] Tests cover: addTvShow happy path (show with multiple seasons and episodes), addTvShow idempotency, addTvShow with image failure, refreshTvShow with new season added, refreshTvShow with new episode in existing season, refreshTvShow diff accuracy, refreshTvShow 404

## Notes

The add flow involves multiple sequential API calls to TheTVDB (show details, then seasons list, then episodes per season). For a show with 5 seasons, this is roughly 7 API calls. The JWT auth layer handles any token expiry transparently. The refresh flow performs an upsert pattern — match by tvdbId, insert if new, update if existing. The diff is calculated by counting inserts vs updates during the upsert loop.
