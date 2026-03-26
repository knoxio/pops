# US-02: Status badges

> PRD: [040 — Arr Status Display](README.md)
> Status: To Review

## Description

As a user, I want to see colour-coded status badges on movie and TV show detail pages so that I can tell at a glance whether content is available, downloading, monitored, or not tracked in Radarr/Sonarr.

## Acceptance Criteria

- [ ] `ArrStatusBadge` component renders one of four states: "Available" (green), "Downloading" (yellow), "Monitored" (blue), "Not Monitored" (grey)
- [ ] "Downloading" badge includes a progress percentage when available (e.g., "Downloading 45%")
- [ ] Badge precedence: Available > Downloading > Monitored > Not Monitored — only one badge per item
- [ ] Movie detail page queries Radarr for the movie's status by TMDB ID and renders the badge
- [ ] TV show detail page queries Sonarr for the series' status by TVDB ID and renders the badge
- [ ] Badges do not render when the corresponding service is not configured (`getConfig` returns `configured: false`)
- [ ] Badges do not render when the corresponding service is unreachable — no error states, no loading spinners, the badge area is simply empty
- [ ] Badge fetches use the cached arr client (30s TTL) — navigating away and back does not trigger redundant API calls
- [ ] Badge renders inline within the detail page header area, next to the title or metadata row
- [ ] Radarr status mapping: `hasFile: true` → Available; queue entry exists → Downloading (with progress from queue); `monitored: true` → Monitored; movie not found in Radarr → Not Monitored
- [ ] Sonarr status mapping: all episodes have files → Available; queue entry exists → Downloading; `monitored: true` → Monitored; series not found in Sonarr → Not Monitored
- [ ] Tests verify: correct badge state for each Radarr/Sonarr status, badge hidden when service not configured, badge hidden when service unreachable, progress percentage displays correctly

## Notes

The badge is a pure display component driven by external state. It should not trigger any mutations. The detail page is responsible for fetching the status and passing it as props. For Sonarr, "Available" means all episodes of the series have files — partial availability still shows "Monitored" since individual episode tracking is not in scope here.
