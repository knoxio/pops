# PRD-042: Sonarr Request Management

> Epic: [07 — Radarr & Sonarr](../../epics/07-radarr-sonarr.md)
> Status: Not started

## Overview

Manage TV series via Sonarr from within POPS. Add series, manage season/episode monitoring, view a calendar of upcoming episodes, select quality profiles. Handles the complexity of future vs past seasons differently to avoid downloading entire back catalogues by default.

## Integration Points

| Location | Action |
|----------|--------|
| TV show detail page | "Request" button in header area (if series not in Sonarr), per-season monitoring toggles |
| Season detail page | Episode-level monitoring toggles |
| Search results | "Request" action on TV show result cards |
| `/media/arr/calendar` | Upcoming episodes calendar view |

## Request Flow

1. User clicks "Request" on a TV show
2. Modal opens with quality profile, root folder, and language profile selectors (fetched from Sonarr API)
3. Season monitoring defaults: future seasons monitored, past seasons not monitored
4. User adjusts season monitoring if desired, then confirms
5. POST to Sonarr adds the series with selected options
6. Status badge updates to "Monitored"

## Season Monitoring

| Season Type | Default | Rationale |
|-------------|---------|-----------|
| Future seasons (not yet aired) | Monitored | User wants new episodes as they air |
| Current season (airing now) | Monitored | User wants remaining episodes |
| Past seasons (fully aired) | Not monitored | Prevents downloading 20 seasons the user may already have or not want |

Users override defaults in the request modal or later via per-season toggles on the show detail page.

## UI Components

### RequestSeriesModal

| Element | Detail |
|---------|--------|
| Series name + year | Confirmation header |
| Quality profile select | Dropdown from Sonarr's quality profiles |
| Root folder select | Dropdown with path + free space |
| Language profile select | Dropdown from Sonarr's language profiles |
| Season monitoring list | Checkbox per season with smart defaults (future=on, past=off) |
| Confirm button | "Request" — triggers add to Sonarr |
| Cancel button | Closes without action |
| Loading/error states | Same pattern as Radarr request modal |

### Season Monitoring Toggles

| Element | Detail |
|---------|--------|
| Location | TV show detail page, within each season row |
| Toggle | On/off switch per season — updates Sonarr monitoring |
| Episode monitoring | On season detail page, per-episode toggles |
| Sync indicator | Shows when local toggle state matches Sonarr state |

### Calendar

| Element | Detail |
|---------|--------|
| Route | `/media/arr/calendar` |
| Time range | Next 30 days from today |
| Grouping | Episodes grouped by air date |
| Per episode | Series poster thumbnail, series name, episode name, season/episode number, air time |
| Empty state | "No upcoming episodes" when no monitored shows have episodes in the next 30 days |

## API Surface

### media.sonarr

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `getQualityProfiles` | (none) | `{ data: QualityProfile[] }` | Proxies `GET /api/v3/qualityprofile` |
| `getRootFolders` | (none) | `{ data: RootFolder[] }` | Proxies `GET /api/v3/rootfolder` |
| `getLanguageProfiles` | (none) | `{ data: LanguageProfile[] }` | Proxies `GET /api/v3/languageprofile` |
| `checkSeries` | tvdbId | `{ exists, sonarrId?, monitored? }` | Proxies `GET /api/v3/series?tvdbId=X` |
| `addSeries` | tvdbId, title, qualityProfileId, rootFolderPath, languageProfileId, seasons[] | `{ data: SonarrSeries }` | Proxies `POST /api/v3/series` with monitoring options |
| `updateMonitoring` | sonarrId, monitored | `{ data: SonarrSeries }` | Proxies `PUT /api/v3/series/:id` |
| `updateSeasonMonitoring` | sonarrId, seasonNumber, monitored | `{ data: SonarrSeries }` | Updates one season's monitoring via series PUT |
| `updateEpisodeMonitoring` | episodeIds[], monitored | `{ message }` | Proxies `PUT /api/v3/episode/monitor` |
| `getCalendar` | start, end | `{ data: CalendarEpisode[] }` | Proxies `GET /api/v3/calendar?start=X&end=Y` |
| `triggerSearch` | sonarrId, seasonNumber? | `{ message }` | Proxies `POST /api/v3/command` — series search or season search |

## Business Rules

- Requesting a series adds it to Sonarr but does NOT trigger an automatic search for all seasons — only monitored seasons are searched, preventing unwanted bulk downloads
- Season monitoring defaults protect against downloading entire back catalogues — past seasons default to off
- Per-season and per-episode monitoring changes are immediate — they update Sonarr in real time, not batched
- The calendar shows only episodes from monitored series — unmonitored series do not appear
- Language profile is required by Sonarr's API for series creation — default to the first available profile if only one exists
- Root folder display includes free disk space for informed selection

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Series already exists in Sonarr | `checkSeries` returns `exists: true`; "Request" button not rendered, season toggles show current monitoring state |
| Sonarr not configured | "Request" button disabled with tooltip; season toggles not rendered; calendar shows empty state |
| Sonarr unreachable | Same graceful degradation as Radarr — features absent, no errors |
| Series has 20+ seasons | Season list in modal is scrollable; defaults prevent accidental mass download |
| Season monitoring toggled on for past season | Sonarr begins monitoring; user may want to trigger a manual search |
| All episodes of a season have files | Season shows as "complete" — monitoring toggle still functional |
| Calendar returns no upcoming episodes | "No upcoming episodes in the next 30 days" empty state |
| Episode airs today | Shows in calendar under today's date |
| Series cancelled (status: "Ended") | Still requestable — user may want to download existing seasons |
| Language profiles endpoint returns empty | Modal shows error — Sonarr requires a language profile |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-sonarr-api-client](us-01-sonarr-api-client.md) | Sonarr v3 API client — profiles, root folders, add series, check existence, update monitoring, calendar, trigger search | Yes |
| 02 | [us-02-request-modal](us-02-request-modal.md) | Request modal with quality/language/root folder selectors, season monitoring defaults (future=on, past=off) | Blocked by us-01 |
| 03 | [us-03-season-monitoring](us-03-season-monitoring.md) | Per-season monitoring toggles on show detail, per-episode monitoring on season detail | Blocked by us-01 |
| 04 | [us-04-calendar](us-04-calendar.md) | Calendar view of upcoming episodes (next 30 days), grouped by date, poster/series/episode display | Blocked by us-01 |

US-01 is the API layer. US-02, US-03, and US-04 can be built in parallel once US-01 is complete.

## Dependencies

- PRD-040 (Arr Status Display) — base client factory and settings configuration
- PRD-034 (TV Show Detail Page) — detail page where season monitoring toggles render

## Out of Scope

- Radarr integration (PRD-041)
- Bulk requesting multiple series
- Profile management within POPS (create/edit quality or language profiles)
- Download queue management
- Sonarr tag management
- Episode renaming or file management
