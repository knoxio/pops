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
- [x] Plex items missing a TMDB ID (movies) or TheTVDB ID (TV shows) are skipped
- [ ] Skipped items are tracked with title and reason (e.g., "Breaking Bad — no TheTVDB ID in Plex metadata") — **currently only a counter, no diagnostic info**
- [ ] Each item sync is its own transaction — a failure on one item does not roll back others — **errors caught individually but no explicit per-item transactions**
- [x] Both procedures return `{ synced: number, skipped: number, errors: number }`
- [ ] Return value includes a `skippedItems` array with `{ title, reason }` for each skipped item — **not implemented, only a count is returned**
- [x] Error results include descriptive messages (e.g., "Movie 'Title' has no TMDB ID")
- [ ] External ID extraction handles both legacy Plex agents (`com.plexapp.agents.thetvdb://`) and new Plex agent (`plex://show/` with `tvdb://` in Guid array) — **only checks `externalIds` array for `tvdb` source; may miss shows matched by newer Plex metadata agents**
- [x] Sync is idempotent — running the same sync twice produces identical results
- [x] Auth token is validated before sync begins — returns auth error if disconnected
- [x] Tests cover: movie sync creates new records, skips existing, handles missing TMDB ID, TV show sync creates show/season/episode hierarchy, adds new seasons to existing show, idempotent repeated sync, error reporting, auth validation

## Notes

Plex stores external IDs in multiple formats depending on the metadata agent:
- **Legacy agents:** `com.plexapp.agents.themoviedb://12345`, `com.plexapp.agents.thetvdb://67890`
- **New Plex agent (default since ~2020):** Primary GUID is `plex://show/5d776...` with external IDs in a separate `Guid` array as `tvdb://67890`, `tmdb://12345`

The extraction code MUST handle both formats. If it only checks one format, all shows from Plex servers using the other agent will silently skip. The new Plex agent is now the default — most users will have it.

Every skipped item must include its title and the reason it was skipped, so the user can diagnose the issue (e.g., "my Plex server uses a different metadata agent").
