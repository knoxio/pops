# US-03: Library sync

> PRD: [039 — Plex Sync](README.md)
> Status: Partial

## Description

As a user, I want to sync my Plex movie and TV show libraries into POPS so that my media collection is available in one place without manual entry.

## Acceptance Criteria

- [x] `media.plex.syncMovies(sectionId)` fetches all movies from the specified Plex library section
- [x] For each Plex movie, the TMDB ID is extracted from Plex's external ID metadata (GUIDs)
- [x] Movies are matched against the POPS library by TMDB ID
- [x] New movies (no TMDB ID match) are created in the POPS library using Plex metadata (title, year, poster, overview, genres)
- [x] Existing movies (TMDB ID match) are skipped — no updates to existing records
- [x] `media.plex.syncTvShows(sectionId)` fetches all TV shows from the specified Plex library section
- [x] For each Plex show, the TheTVDB ID is extracted from Plex's external ID metadata
- [x] TV shows are matched against the POPS library by TheTVDB ID
- [x] New shows are created with their full season and episode hierarchy
- [x] Existing shows are checked for new seasons/episodes — new ones are added, existing ones skipped
- [x] Plex items missing a TMDB ID (movies) or TheTVDB ID (TV shows) are skipped and counted as errors
- [ ] Each item sync is its own transaction — a failure on one item does not roll back others — errors caught individually but no explicit per-item transactions
- [x] Both procedures return `{ synced: number, skipped: number, errors: number }`
- [x] Error results include descriptive messages (e.g., "Movie 'Title' has no TMDB ID")
- [x] Sync is idempotent — running the same sync twice produces identical results
- [x] Auth token is validated before sync begins — returns auth error if disconnected
- [x] Tests cover: movie sync creates new records, skips existing, handles missing TMDB ID, TV show sync creates show/season/episode hierarchy, adds new seasons to existing show, idempotent repeated sync, error reporting, auth validation

## Notes

Plex stores external IDs as GUIDs in the format `com.plexapp.agents.themoviedb://12345` or `plex://movie/5d776...` with linked TMDB/TheTVDB references. Parsing these GUIDs to extract the numeric ID is the critical matching step. If Plex has been configured with a non-standard metadata agent, the GUID format may differ — handle this gracefully by counting it as an error rather than crashing the sync.
