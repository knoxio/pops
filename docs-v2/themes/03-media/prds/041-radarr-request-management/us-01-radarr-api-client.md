# US-01: Radarr API client

> PRD: [041 — Radarr Request Management](README.md)
> Status: Partial

## Description

As a developer, I want a Radarr v3 API client built on the shared arr base client so that POPS can fetch quality profiles, root folders, check movie existence, add movies, update monitoring, and trigger searches.

## Acceptance Criteria

- [x] Radarr client extends the base arr client factory from PRD-040
- [ ] `media.radarr.getQualityProfiles()` returns a typed array of quality profiles from Radarr's `GET /api/v3/qualityprofile` endpoint
- [ ] Each quality profile includes at minimum: `id`, `name`
- [ ] `media.radarr.getRootFolders()` returns a typed array of root folders from Radarr's `GET /api/v3/rootfolder` endpoint
- [ ] Each root folder includes: `id`, `path`, `freeSpace` (in bytes)
- [ ] `media.radarr.checkMovie(tmdbId)` queries `GET /api/v3/movie?tmdbId=X` and returns `{ exists: boolean, radarrId?: number, monitored?: boolean }`
- [ ] `checkMovie` returns `{ exists: false }` when Radarr returns an empty array for the TMDB ID
- [ ] `media.radarr.addMovie(input)` sends `POST /api/v3/movie` with `{ tmdbId, title, qualityProfileId, rootFolderPath, monitored: true, addOptions: { searchForMovie: true } }` and returns the created movie object
- [ ] `media.radarr.updateMonitoring(radarrId, monitored)` sends `PUT /api/v3/movie/:id` with the updated monitoring flag and returns the updated movie
- [ ] `media.radarr.triggerSearch(radarrId)` sends `POST /api/v3/command` with `{ name: "MoviesSearch", movieIds: [radarrId] }` and returns a success message
- [ ] All procedures return structured error objects on failure (network error, 401, 404, etc.) — never throw unhandled exceptions
- [ ] All procedures require Radarr to be configured — return a clear error if URL or API key is missing from settings
- [ ] Input validation: `tmdbId` is a positive integer, `qualityProfileId` is a positive integer, `rootFolderPath` is a non-empty string
- [ ] Tests verify: quality profile fetch, root folder fetch with free space, checkMovie returns exists=true when found, checkMovie returns exists=false when not found, addMovie sends correct payload, updateMonitoring toggles flag, triggerSearch sends correct command, error handling on 401/network failure, validation rejects invalid inputs

## Notes

The Radarr client does not cache quality profiles or root folders — these are fetched fresh when the request modal opens. The base client's 30s cache from PRD-040 is for status badge data only. Radarr's `PUT /api/v3/movie/:id` requires the full movie object in the body — fetch the existing movie first, merge the monitoring change, then PUT.
