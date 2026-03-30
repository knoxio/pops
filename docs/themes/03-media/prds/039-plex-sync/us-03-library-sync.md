# US-03: Library sync

> PRD: [039 — Plex Sync](README.md)
> Status: Done

## Description

As a user, I want to sync my Plex movie and TV show libraries into POPS so that my media collection is available in one place without manual entry.

## Acceptance Criteria

- [x] `media.plex.syncMovies(sectionId)` fetches all movies from the specified Plex library section (paginated via X-Plex-Container-Start/Size)
- [x] For each Plex movie, the TMDB ID is extracted from Plex's external ID metadata (Guid array)
- [x] Movies are matched against the POPS library by TMDB ID
- [x] New movies (no TMDB ID match) are created in the POPS library using TMDB detail fetch
- [x] Existing movies (TMDB ID match) are skipped — no updates to existing records
- [x] `media.plex.syncTvShows(sectionId)` fetches all TV shows from the specified Plex library section (paginated)
- [x] For each Plex show, the TheTVDB ID is extracted from Plex's external ID metadata
- [x] TV shows are matched against the POPS library by TheTVDB ID
- [x] New shows are created with their full season and episode hierarchy via TheTVDB
- [x] Existing shows are checked for new seasons/episodes — new ones are added, existing ones skipped
- [x] Plex items missing a TMDB ID (movies) or TheTVDB ID (TV shows) are skipped
- [x] Skipped items tracked with title, year, and reason (TvSyncSkip type with skipReasons array)
- [x] Each item sync is wrapped in try/catch — a failure on one item does not affect others
- [x] Both procedures return progress objects with synced, skipped, errors, and skipReasons arrays
- [x] Error results include descriptive messages with title and reason
- [x] External ID extraction parses the new Plex Guid array format (`tvdb://`, `tmdb://`, `imdb://`)
- [x] Sync is idempotent — running the same sync twice produces identical results
- [x] Auth token is validated before sync begins — returns auth error if disconnected
- [x] Tests cover: movie sync, TV sync, skip handling, error reporting, TMDB fallback search, idempotency (14 sync-tv tests, 17 sync-movies tests)

## Notes

Plex stores external IDs in multiple formats depending on the metadata agent:
- **Legacy agents:** `com.plexapp.agents.themoviedb://12345`, `com.plexapp.agents.thetvdb://67890`
- **New Plex agent (default since ~2020):** Primary GUID is `plex://show/5d776...` with external IDs in a separate `Guid` array as `tvdb://67890`, `tmdb://12345`

The extraction code MUST handle both formats. If it only checks one format, all shows from Plex servers using the other agent will silently skip. The new Plex agent is now the default — most users will have it.

Every skipped item must include its title and the reason it was skipped, so the user can diagnose the issue (e.g., "my Plex server uses a different metadata agent").
