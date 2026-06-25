# Sonarr Request Management

Status: Partial — the API client, season/episode monitoring, and the upcoming-episodes calendar are built and wired; `RequestSeriesModal` exists and is tested but has no entry point in the UI (no "Request" button opens it from the show detail header or search results). The missing wiring is captured in [ideas/sonarr-request-entry-point.md](../ideas/sonarr-request-entry-point.md).

Manage TV series through a Sonarr instance from inside the media pillar: add a series with per-season monitoring, toggle season and episode monitoring after the fact, and browse a calendar of upcoming episodes. Season-monitoring defaults deliberately diverge for future vs past seasons to avoid pulling an entire back catalogue by accident.

Config is ENV-ONLY (`SONARR_URL`, `SONARR_API_KEY`); the pillar cannot write its own credentials at runtime. When Sonarr is unconfigured or unreachable, every surface degrades to an empty/absent state rather than erroring.

## REST API surface

All routes live under the media `arr.*` sub-router. Handlers are thin wrappers over the env-configured Sonarr client; mutating routes raise `409 Conflict` when Sonarr is not configured. Read routes that proxy lists return `[]` on upstream failure.

| Method + path                                                         | Purpose                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /arr/sonarr/quality-profiles`                                    | List quality profiles (`{ id, name }`)                          |
| `GET /arr/sonarr/root-folders`                                        | List root folders (`{ id, path, freeSpace }`)                   |
| `GET /arr/sonarr/language-profiles`                                   | List language profiles (`{ id, name }`)                         |
| `GET /arr/sonarr/calendar?start&end`                                  | Upcoming episodes between two ISO dates (5-min server cache)    |
| `GET /arr/sonarr/series/:tvdbId/check`                                | `{ exists, sonarrId?, monitored?, seasons? }` by TVDB id        |
| `GET /arr/sonarr/series/:tvdbId/status`                               | Status projection for the show badge                            |
| `GET /arr/sonarr/series/:sonarrId/episodes?seasonNumber?`             | Episodes, optionally filtered by season                         |
| `POST /arr/sonarr/series`                                             | Add a series → `201 { data: SonarrSeriesFull }`                 |
| `PATCH /arr/sonarr/series/:sonarrId/monitoring`                       | Toggle whole-series monitoring                                  |
| `PATCH /arr/sonarr/series/:sonarrId/seasons/:seasonNumber/monitoring` | Toggle one season's monitoring                                  |
| `PATCH /arr/sonarr/episodes/monitoring`                               | Batch-toggle episode monitoring (`{ episodeIds[], monitored }`) |
| `POST /arr/sonarr/series/:sonarrId/search`                            | Trigger a series or single-season search                        |
| `POST /arr/sonarr/test`, `POST /arr/sonarr/test-saved`                | Connection test (form creds / env creds)                        |

`addSeries` body: `{ tvdbId, title, qualityProfileId, rootFolderPath, languageProfileId, seasons: [{ seasonNumber, monitored }] }`. The client appends `addOptions.searchForMissingEpisodes: false` so adding never bulk-downloads — searches are explicit.

### Wire shapes

- `SonarrSeriesFull` — `{ id, title, tvdbId, monitored, statistics, seasons: [{ seasonNumber, monitored, statistics? }] }`.
- `SonarrEpisode` — `{ id, seriesId, seasonNumber, episodeNumber, title, monitored, hasFile }`.
- `CalendarEpisode` — `{ id, seriesId, seriesTitle, tvdbId, episodeTitle, seasonNumber, episodeNumber, airDateUtc, hasFile, posterUrl }`. `posterUrl` is Sonarr's own remote/absolute image URL — it does NOT go through the media `/media/images` byte route.

## Business rules

- Sonarr's API has no partial-update for series — season-level and whole-series monitoring changes fetch the full series, mutate the one field, then PUT the whole object back.
- Adding a series sets per-season monitoring on creation but searches nothing; only later explicit searches (or monitored future episodes airing) trigger downloads.
- Season-monitoring defaults protect against mass back-catalogue downloads: future/unannounced seasons default monitored, fully-aired past seasons default unmonitored. A season is "future" when its first-air date is missing or after now.
- Per-season and per-episode monitoring changes are immediate (not batched) and clear the arr status caches + the per-client GET cache so reads are fresh.
- The calendar reflects only what Sonarr returns for monitored series; the window is the next 30 days from today.

## Acceptance criteria

### API client (built)

- [x] `GET /arr/sonarr/quality-profiles | root-folders | language-profiles` each return typed arrays from the matching Sonarr v3 endpoints.
- [x] `GET /arr/sonarr/series/:tvdbId/check` returns `{ exists: false }` for an empty Sonarr result and `{ exists, sonarrId, monitored, seasons }` when present.
- [x] `POST /arr/sonarr/series` sends the season array plus `addOptions.searchForMissingEpisodes: false` and returns the created series (`201`).
- [x] `PATCH …/series/:sonarrId/seasons/:seasonNumber/monitoring` mutates only the target season via fetch-merge-PUT.
- [x] `PATCH /arr/sonarr/episodes/monitoring` sends a batch `{ episodeIds, monitored }` in one request.
- [x] `GET /arr/sonarr/calendar?start&end` validates ISO dates and returns episodes carrying `seriesTitle`, `episodeTitle`, `seasonNumber`, `episodeNumber`, `airDateUtc`, `hasFile`, `posterUrl`.
- [x] `POST /arr/sonarr/series/:sonarrId/search` issues a season search when `seasonNumber` is given, otherwise a series search.
- [x] Input validation: positive-integer ids, non-empty `rootFolderPath`, ISO `start`/`end`; mutating routes return `409` when Sonarr is unconfigured.
- [x] Unit tests cover profiles, check exists/not-exists, addSeries payload, season vs episode monitoring, calendar range, search variants, and unconfigured/upstream-failure paths.

### Request modal (built, not wired)

- [x] `RequestSeriesModal` takes `{ tvdbId, title, year, seasons[] }`, shows quality/root-folder/language dropdowns populated from the three list endpoints, each defaulting to the first option.
- [x] Root-folder option renders path + human-readable free space.
- [x] Season list shows a checkbox per season (number + air year) with smart defaults (future/unannounced on, past off); Select All / Deselect All appear when more than 3 seasons exist; the list scrolls past ~48 rows.
- [x] Submit is disabled until all three profiles are chosen; on submit it POSTs the series with the season array, shows a pending state, then a brief success before closing; errors surface inline; cancel/backdrop close without any call.
- [x] Component tests cover dropdown population, default application, bulk toggles, submit payload, success/error/cancel paths.
- [ ] No surface opens this modal — covered by [ideas/sonarr-request-entry-point.md](../ideas/sonarr-request-entry-point.md).

### Season + episode monitoring (built)

- [x] The TV show detail page renders a monitor switch per season row only when the series exists in Sonarr (`sonarrSeries.exists && sonarrId != null`); switches reflect Sonarr state and are hidden when unconfigured or absent.
- [x] Toggling a season updates optimistically, disables during the in-flight call, and reverts with an error toast on failure.
- [x] The season detail page renders per-episode monitor controls plus a "Monitor All / Unmonitor All" batch button, reflecting Sonarr state, updating optimistically, reverting on failure, and showing a downloaded indicator for episodes with files.
- [x] `TvShowDetailPage` and `SeasonDetailPage` tests cover toggle state, optimistic update + revert, batch toggle, and hidden-when-unconfigured behaviour.

### Calendar (built)

- [x] `/media/arr/calendar` fetches `getCalendar(today, today+30d)` once Sonarr is confirmed configured and refetches on window focus.
- [x] Episodes group by air date (chronological date headers, today highlighted with a "Today" badge) and sort by air time within a group.
- [x] Each row shows poster thumbnail, series name, episode title, `SxxExx`, and a Downloaded/Missing badge driven by `hasFile`; clicking a row links to the show detail page.
- [x] Empty state "No upcoming episodes in the next 30 days"; when Sonarr is unconfigured, a "configure Sonarr" notice links to `/media/arr`; a skeleton renders while loading.
- [x] `CalendarPage` tests cover grouping, sorting, today highlight, empty/unconfigured states, and the downloaded/missing indicators.

## Edge cases

| Case                     | Behaviour                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Series already in Sonarr | `check` returns `exists: true` with current per-season monitoring; season switches render against that state |
| Sonarr not configured    | List routes return `[]`; mutating routes `409`; calendar shows the configure notice; season switches absent  |
| Sonarr unreachable       | Calendar serves the last cached result if any, else empty; no surfaced error                                 |
| Series with many seasons | Modal season list scrolls; defaults prevent accidental mass download; bulk controls available                |
| Past season toggled on   | Sonarr starts monitoring; a manual season search is needed to fetch existing episodes                        |
| Episode airs today       | Appears under today's (highlighted) date group                                                               |
| Calendar returns nothing | Empty-state copy shown                                                                                       |

## Out of scope

- Radarr integration (separate movie-request flow).
- Bulk-requesting multiple series at once.
- Creating/editing quality or language profiles from inside the pillar.
- Download-queue management, tag management, episode renaming or file management.
- In-app credential editing (config is env-only; see [ideas/arr-credential-settings-page.md](../ideas/arr-credential-settings-page.md)).
