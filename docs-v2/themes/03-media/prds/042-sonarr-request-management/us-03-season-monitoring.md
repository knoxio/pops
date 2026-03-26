# US-03: Season and episode monitoring

> PRD: [042 — Sonarr Request Management](README.md)
> Status: Not started

## Description

As a user, I want per-season monitoring toggles on the TV show detail page and per-episode monitoring on the season detail page so that I can control exactly what Sonarr downloads after a series is added.

## Acceptance Criteria

- [ ] TV show detail page renders a monitoring toggle (on/off switch) next to each season row when the series exists in Sonarr
- [ ] Season monitoring toggles reflect the current Sonarr state — fetched via the series data from Sonarr
- [ ] Toggling a season's monitoring calls `media.sonarr.updateSeasonMonitoring(sonarrId, seasonNumber, monitored)` and updates the UI optimistically
- [ ] If the monitoring update fails, the toggle reverts to its previous state and shows a brief error toast
- [ ] Season monitoring toggles do not render when Sonarr is not configured or the series is not in Sonarr
- [ ] Season detail page renders a monitoring checkbox next to each episode when the series exists in Sonarr
- [ ] Episode monitoring checkboxes reflect the current Sonarr state
- [ ] Toggling an episode's monitoring calls `media.sonarr.updateEpisodeMonitoring([episodeId], monitored)` and updates optimistically
- [ ] Episode monitoring checkbox reverts on failure with error toast
- [ ] Batch toggle: "Monitor All" / "Unmonitor All" button on the season detail page for all episodes in that season
- [ ] Batch toggle calls `media.sonarr.updateEpisodeMonitoring(allEpisodeIds, monitored)` in a single request
- [ ] Episodes with files show a "downloaded" indicator alongside the monitoring checkbox
- [ ] Toggle switches have a brief loading state (subtle opacity change) during the API call
- [ ] Tests verify: toggles reflect Sonarr state, toggle calls correct API, optimistic update on toggle, revert on failure, batch monitor/unmonitor sends all episode IDs, toggles hidden when Sonarr not configured, toggles hidden when series not in Sonarr

## Notes

Season monitoring updates go through the series PUT endpoint (Sonarr requires the full series object). Episode monitoring uses a dedicated batch endpoint that accepts an array of episode IDs. Optimistic updates provide instant feedback — the toggle moves immediately and only reverts if the API call fails. This avoids the sluggish feel of waiting for a round trip on every toggle.

Audited — no season/episode monitoring toggle UI found in codebase; the SonarrClient tracks episode counts for status display but has no monitoring control methods; status confirmed Not started.
