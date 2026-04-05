# US-04: Upcoming episodes calendar

> PRD: [042 — Sonarr Request Management](README.md)
> Status: Done

## Description

As a user, I want a calendar view of upcoming episodes from my monitored TV shows so that I know what is airing in the next 30 days.

## Acceptance Criteria

- [x] Calendar page renders at `/media/arr/calendar`
- [x] Page fetches upcoming episodes via `media.sonarr.getCalendar(today, today + 30 days)` on mount
- [x] Episodes are grouped by air date, with date headers (e.g., "Thursday, 27 March 2026")
- [x] Each episode entry shows: series poster thumbnail, series name, episode name, season/episode number (e.g., "S03E07"), and air time
- [x] Episodes within a date group are sorted by air time ascending
- [x] Date groups are sorted chronologically (nearest date first)
- [x] Today's date header is visually distinct (highlight or "Today" label)
- [x] Episodes that have already aired today but have files show a "downloaded" indicator
- [x] Episodes that have aired but do not have files show a "missing" indicator
- [x] Clicking a series name or poster navigates to the TV show detail page
- [x] Empty state: "No upcoming episodes in the next 30 days" when the calendar returns no results
- [x] Empty state when Sonarr is not configured: "Connect Sonarr to see upcoming episodes" with link to `/media/arr` settings
- [x] Loading state: skeleton list matching the date-group layout
- [x] Calendar data refreshes on page focus (user returns to tab) to catch new data
- [x] Tests verify: episodes grouped by date correctly, episodes sorted by air time within group, today's header is highlighted, click navigates to show detail, empty state for no episodes, empty state for unconfigured Sonarr, downloaded/missing indicators display correctly

## Notes

The calendar is a flat chronological list grouped by date, not a traditional month-grid calendar. This format works better for the typical case of 5-15 upcoming episodes across a few shows. The 30-day window balances usefulness with API response size. Refreshing on page focus ensures the user sees current data without manual refresh.
