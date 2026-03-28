# US-02: Status badges

> PRD: [040 — Arr Status Display](README.md)
> Status: Partial

## Description

As a user, I want to see colour-coded status badges on movie and TV show detail pages so that I can tell at a glance whether content is available, downloading, monitored, or not tracked in Radarr/Sonarr.

## Acceptance Criteria

- [ ] `ArrStatusBadge` component renders one of four states: "Available" (green), "Downloading" (yellow), "Monitored" (blue), "Not Monitored" (grey) — component exists; "Monitored" is yellow not blue; "Not Monitored" renders as grey ("unmonitored")
- [x] "Downloading" badge includes a progress percentage when available (e.g., "Downloading 45%")
- [x] Badge precedence: Available > Downloading > Monitored > Not Monitored — only one badge per item
- [x] Movie detail page queries Radarr for the movie's status by TMDB ID and renders the badge
- [x] TV show detail page queries Sonarr for the series' status by TVDB ID and renders the badge
- [x] Badges do not render when the corresponding service is not configured
- [ ] Badges do not render when the corresponding service is unreachable — shows "Radarr unavailable" / "Sonarr unavailable" grey badge instead of empty area
- [x] Badge fetches use the cached service (5-min TTL for movie/show status)
- [x] Badge renders inline within the detail page header area
- [x] Radarr status mapping implemented correctly
- [x] Sonarr status mapping implemented correctly
- [x] Tests verify badge states, hidden when not configured, progress percentage

## Notes

The badge is a pure display component driven by external state. It should not trigger any mutations. The detail page is responsible for fetching the status and passing it as props. For Sonarr, "Available" means all episodes of the series have files — partial availability still shows "Monitored" since individual episode tracking is not in scope here.
