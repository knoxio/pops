# US-01: Sonarr API client

> PRD: [042 — Sonarr Request Management](README.md)
> Status: Done

## Description

As a developer, I want a Sonarr v3 API client built on the shared arr base client so that POPS can fetch profiles, manage series, control season/episode monitoring, retrieve calendar data, and trigger searches.

## Acceptance Criteria

- [x] Sonarr client extends the base arr client factory from PRD-040
- [x] `media.sonarr.getQualityProfiles()` returns a typed array of quality profiles from Sonarr's `GET /api/v3/qualityprofile` endpoint, each with at minimum `id` and `name`
- [x] `media.sonarr.getRootFolders()` returns a typed array of root folders from `GET /api/v3/rootfolder`, each with `id`, `path`, `freeSpace`
- [x] `media.sonarr.getLanguageProfiles()` returns a typed array of language profiles from `GET /api/v3/languageprofile`, each with `id` and `name`
- [x] `media.sonarr.checkSeries(tvdbId)` queries `GET /api/v3/series?tvdbId=X` and returns `{ exists: boolean, sonarrId?: number, monitored?: boolean }`
- [x] `checkSeries` returns `{ exists: false }` when Sonarr returns an empty array for the TVDB ID
- [x] `media.sonarr.addSeries(input)` sends `POST /api/v3/series` with `{ tvdbId, title, qualityProfileId, rootFolderPath, languageProfileId, seasons, addOptions: { searchForMissingEpisodes: false } }` and returns the created series
- [x] The `seasons` field in `addSeries` accepts an array of `{ seasonNumber, monitored }` objects to set per-season monitoring on creation
- [x] `media.sonarr.updateMonitoring(sonarrId, monitored)` sends `PUT /api/v3/series/:id` with the updated monitoring flag (requires fetching the full series object first, merging, then PUT)
- [x] `media.sonarr.updateSeasonMonitoring(sonarrId, seasonNumber, monitored)` fetches the series, updates the specific season's monitoring flag in the seasons array, then PUTs the full series object
- [x] `media.sonarr.updateEpisodeMonitoring(episodeIds, monitored)` sends `PUT /api/v3/episode/monitor` with `{ episodeIds, monitored }` for batch episode monitoring updates
- [x] `media.sonarr.getCalendar(start, end)` queries `GET /api/v3/calendar?start=X&end=Y` (ISO 8601 dates) and returns a typed array of calendar episodes, each with `seriesTitle`, `episodeTitle`, `seasonNumber`, `episodeNumber`, `airDateUtc`, `hasFile`
- [x] `media.sonarr.triggerSearch(sonarrId, seasonNumber?)` sends `POST /api/v3/command` — if `seasonNumber` is provided, sends `{ name: "SeasonSearch", seriesId, seasonNumber }`; otherwise sends `{ name: "SeriesSearch", seriesId }`
- [x] All procedures return structured error objects on failure — never throw unhandled exceptions
- [x] All procedures require Sonarr to be configured — return a clear error if URL or API key is missing
- [x] Input validation: `tvdbId` is a positive integer, `qualityProfileId` and `languageProfileId` are positive integers, `rootFolderPath` is a non-empty string, `start`/`end` are valid ISO 8601 date strings
- [x] Tests verify: all profile fetches return typed arrays, checkSeries exists/not-exists cases, addSeries sends correct payload with season monitoring, updateSeasonMonitoring modifies only the target season, updateEpisodeMonitoring sends batch payload, calendar returns episodes in date range, triggerSearch sends series vs season command correctly, error handling on 401/network failure, validation rejects invalid inputs

## Notes

Sonarr's API requires the full series object for PUT updates — partial updates are not supported. The client must fetch the current state, merge the change, then PUT the full object. This applies to both series-level and season-level monitoring updates. The `addOptions.searchForMissingEpisodes: false` default prevents bulk downloads on series creation — users trigger searches explicitly for past seasons.
