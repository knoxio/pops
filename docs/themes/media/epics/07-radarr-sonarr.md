# Epic: Radarr & Sonarr

**Theme:** Media
**Priority:** 7 (can run in parallel with Epic 6 after Epic 3)
**Status:** Done

## Goal

Surface Radarr and Sonarr status within POPS — what's monitored, what's downloading, what's available. Read-only display. No management UI in v1.

## Scope

### In scope

- **Radarr API client service:**
  - Authenticate with Radarr (API key via environment variable / Docker secret)
  - Fetch monitored movies list
  - Fetch movie status (downloaded, missing, queued)
  - Fetch download queue (active downloads with progress)
- **Sonarr API client service:**
  - Authenticate with Sonarr (API key via environment variable / Docker secret)
  - Fetch monitored series list
  - Fetch series status (downloaded episodes vs total)
  - Fetch download queue (active downloads with progress)
- **Status display on media detail pages:**
  - Movie detail: show Radarr status badge (monitored/unmonitored, downloaded/missing/downloading with %)
  - TV show detail: show Sonarr status badge (monitored/unmonitored, episode availability summary)
  - Status badges are informational only — no actions attached in v1
- **Matching:**
  - Match Radarr items to local library by TMDB ID, Sonarr items by TheTVDB ID (each service uses the corresponding metadata source natively)
  - For items in Radarr/Sonarr but not in the POPS library, optionally surface them as "available but not tracked"
- **Connection settings:**
  - Configuration for Radarr server URL and API key
  - Configuration for Sonarr server URL and API key
  - Connection test for each
  - Either/both/neither can be configured (graceful degradation)
- **Polling:**
  - Fetch status on demand (when viewing a media detail page) or on a schedule (configurable, default every hour)
  - Cache status locally to avoid hitting Radarr/Sonarr on every page load

### Out of scope

- Adding movies/shows to Radarr/Sonarr from POPS (future enhancement)
- Quality profile management
- Download client configuration
- Radarr/Sonarr system status or health monitoring
- Calendar / upcoming releases view
- Any write operations to Radarr or Sonarr

## Deliverables

1. Radarr API client service with authentication and status fetch
2. Sonarr API client service with authentication and status fetch
3. ID-based matching between local library and Radarr (TMDB ID) / Sonarr (TheTVDB ID)
4. Status badges on movie detail pages (Radarr)
5. Status badges on TV show detail pages (Sonarr)
6. Download queue display (active downloads with progress)
7. Connection configuration UI for Radarr and Sonarr
8. Connection test endpoints
9. Status caching with configurable poll interval
10. Graceful degradation when Radarr/Sonarr not configured or unreachable
11. Unit tests for API clients (mocked responses)

## Dependencies

- Epic 0 (Data Model) — local library tables to match against
- Epic 2 (App Package & Core UI) — detail pages to extend with status badges

## Risks

- **API version differences** — Radarr v3 and v4 have different API structures. Sonarr v3 and v4 similarly. Mitigation: target the latest stable API version for each. Document which versions are supported.
- **Network access** — POPS needs network access to Radarr and Sonarr. On the N95, this is local network — trivial. If they're on different hosts, firewall rules may be needed. Mitigation: connection test surfaces connectivity issues immediately.
- **Low value-add for v1** — Read-only status is nice-to-have but not transformative. The real value comes from requesting (future). Mitigation: keep this epic minimal. It's a lightweight integration that sets up the foundation for future management features.
