# PRD-040: Arr Status Display

> Epic: [07 — Radarr & Sonarr](../../epics/07-radarr-sonarr.md)
> Status: Done

## Overview

Read-only integration with Radarr (movies) and Sonarr (TV). Status badges on movie/TV detail pages showing whether content is monitored, downloading, or available. Download queue display. Shared base client pattern for both services. Settings page for configuring connections.

## Routes

| Route        | Page                            |
| ------------ | ------------------------------- |
| `/media/arr` | Arr settings/configuration page |

## Status Badges

Badges appear on movie and TV show detail pages, reflecting the item's state in Radarr/Sonarr.

| Badge         | Colour | Meaning                                       |
| ------------- | ------ | --------------------------------------------- |
| Available     | Green  | Downloaded and available in Plex              |
| Downloading   | Yellow | Currently being downloaded (shows progress %) |
| Monitored     | Blue   | Radarr/Sonarr is tracking this title          |
| Not Monitored | Grey   | Not in Radarr/Sonarr                          |

Badge precedence: Available > Downloading > Monitored > Not Monitored. Only one badge displays per item.

## Settings Page (`/media/arr`)

| Element                 | Detail                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| Radarr URL input        | Text field for base URL (e.g., `http://radarr:7878`)                          |
| Radarr API key input    | Password field, masked in display (shows last 4 chars)                        |
| Radarr test button      | "Test Connection" — returns version info on success, error message on failure |
| Radarr status indicator | Green dot (connected), red dot (error), grey dot (not configured)             |
| Sonarr URL input        | Text field for base URL (e.g., `http://sonarr:8989`)                          |
| Sonarr API key input    | Password field, masked in display (shows last 4 chars)                        |
| Sonarr test button      | "Test Connection" — returns version info on success, error message on failure |
| Sonarr status indicator | Green dot (connected), red dot (error), grey dot (not configured)             |
| Save button             | Saves configuration for both services                                         |

## Base Client Pattern

Both Radarr and Sonarr expose similar REST APIs. Build a shared HTTP client factory that both service-specific clients extend.

| Concern               | Detail                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared factory        | `createArrClient(baseUrl, apiKey)` — returns configured HTTP client with auth header                                                          |
| In-memory cache       | 30-second TTL per endpoint. Status data does not need real-time accuracy                                                                      |
| Cache invalidation    | Manual clear on settings save or test connection                                                                                              |
| Graceful degradation  | If a service is not configured or unreachable, status badges do not appear. No error states, no toast messages — the feature is simply absent |
| Configuration storage | `settings` table — keyed entries for `radarr_url`, `radarr_api_key`, `sonarr_url`, `sonarr_api_key`                                           |

## API Surface

### media.arr

| Procedure      | Input                                                | Output                                                                     | Notes                                                       |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `testRadarr`   | (none)                                               | `{ configured, connected, version?, error? }`                              | Tests Radarr connection using stored config                 |
| `testSonarr`   | (none)                                               | `{ configured, connected, version?, error? }`                              | Tests Sonarr connection using stored config                 |
| `getConfig`    | (none)                                               | `{ radarr: { configured, connected }, sonarr: { configured, connected } }` | Lightweight config state for badge conditional rendering    |
| `getSettings`  | (none)                                               | `{ radarrUrl?, radarrApiKeySet, sonarrUrl?, sonarrApiKeySet }`             | URLs and whether keys are set (keys never returned in full) |
| `saveSettings` | radarrUrl?, radarrApiKey?, sonarrUrl?, sonarrApiKey? | `{ message }`                                                              | Partial updates — only provided fields are saved            |

## Business Rules

- Status badges are read-only — they reflect external state, they do not change it
- Badge visibility is conditional on `getConfig` returning `configured: true` for the relevant service. If Radarr is not configured, movie detail pages show no Radarr badge
- API keys are write-only from the client's perspective — `getSettings` returns whether a key is set, never the key itself
- The 30-second cache TTL balances freshness with API rate limits. Radarr/Sonarr are local services, so latency is negligible
- `saveSettings` accepts partial input — saving only a Radarr URL does not clear the Sonarr config

## Edge Cases

| Case                                                  | Behaviour                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Radarr/Sonarr not configured                          | Badges do not render; settings page shows "Not configured" status       |
| Radarr/Sonarr unreachable                             | Badges do not render; test connection shows error message               |
| API key is invalid                                    | Test connection returns error with message from Radarr/Sonarr           |
| Movie exists in Radarr but is not monitored           | Show grey "Not Monitored" badge (it is in Radarr but monitoring is off) |
| Movie is downloading at 45%                           | Show yellow "Downloading" badge with "45%" text                         |
| Both Radarr and Sonarr configured, only one reachable | Working service shows badges; unreachable service does not              |
| Settings saved with empty API key field               | Existing key is preserved (partial update)                              |
| Cache TTL expires mid-page-view                       | Next badge check triggers a fresh API call; stale data may show briefly |

## User Stories

| #   | Story                                             | Summary                                                                                                                           | Status | Parallelisable   |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-arr-base-client](us-01-arr-base-client.md) | Shared HTTP client factory for Radarr/Sonarr, in-memory cache with 30s TTL, graceful degradation, config storage                  | Done   | Yes              |
| 02  | [us-02-status-badges](us-02-status-badges.md)     | Status badges on movie/TV detail pages — monitored, downloading, available, not monitored — colour-coded with conditional display | Done   | Blocked by us-01 |
| 03  | [us-03-arr-settings](us-03-arr-settings.md)       | Settings page at `/media/arr` with URL/API key inputs, test connection, status indicators, masked key display                     | Done   | Blocked by us-01 |

US-01 is the foundation. US-02 and US-03 can be built in parallel once US-01 is complete.

## Out of Scope

- Requesting/adding movies via Radarr (PRD-041)
- Requesting/adding TV series via Sonarr (PRD-042)
- Download queue management (start/stop/prioritise downloads)
- Radarr/Sonarr webhook receivers for real-time status updates
- Plex availability checks (Epic 06: Plex Sync)

## Drift Check

last checked: 2026-04-17
