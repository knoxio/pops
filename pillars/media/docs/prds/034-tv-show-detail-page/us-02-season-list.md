# US-02: Season list

> PRD: [034 — TV Show Detail Page](README.md)
> Status: Done

## Description

As a user, I want to see a list of seasons for a TV show with episode counts and watch progress so that I can navigate to a specific season and track how much I have watched.

## Acceptance Criteria

- [x] Season list renders below the overview section on the show detail page
- [x] Each season card displays: season poster (fallback to show poster if no season poster), season number (e.g., "Season 1"), episode count (e.g., "10 episodes"), per-season watch progress bar with percentage
- [x] Progress bar colour is green when 100% watched, accent colour otherwise
- [x] Clicking a season card navigates to `/media/tv/:id/season/:num`
- [x] Seasons are sorted by season number ascending
- [x] Specials (season 0) are listed last, not first
- [x] Season progress data comes from `media.watchHistory.progress` (per-season breakdown)
- [x] If the show has no seasons, a message renders: "No seasons available"
- [x] Season cards have hover/focus state for interactivity feedback
- [x] Tests cover: season cards render with correct data, sort order (specials last), click navigation to season detail, progress bar at 0%/50%/100%, empty state when no seasons

## Notes

The season poster may not always be available from TheTVDB — fall back to the show's main poster in that case. The progress data should be fetched alongside the show data to avoid a waterfall (or batch into a single query). Season 0 ("Specials") uses the same card layout but is visually deprioritised by position.
