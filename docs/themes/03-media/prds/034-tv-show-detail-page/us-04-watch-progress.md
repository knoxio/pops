# US-04: Watch progress and batch actions

> PRD: [034 — TV Show Detail Page](README.md)
> Status: Partial

## Description

As a user, I want to see my overall watch progress for a TV show and quickly mark all episodes as watched so that I can track completion and catch up on shows I have finished outside of POPS.

## Acceptance Criteria

- [x] Overall watch progress bar renders on the show detail page showing "X of Y episodes watched" with a percentage
- [x] Progress bar colour is green when 100%, accent colour when less than 100%
- [x] Per-season progress bars on the season cards (from US-02) update in real time after watch events
- [x] "Next Episode" indicator displays as a badge or highlight on the next unwatched episode — the first unwatched episode in air-date order across all seasons
- [x] If all episodes are watched, the "Next Episode" indicator is hidden
- [x] "Mark All Watched" button on the show detail page calls `media.watchHistory.batchLog` for every unwatched episode across all seasons
- [ ] "Mark All Watched" uses optimistic updates — progress bar jumps to 100%, all season progress bars update, reverts on failure — no `onMutate` handler; progress only updates after API success via invalidation; no `onError` / rollback
- [x] "Mark All Watched" is hidden or disabled when all episodes are already watched
- [x] Watch progress data is fetched via `media.watchHistory.progress(tvShowId)` which returns overall and per-season statistics
- [x] Progress bars and next episode indicator refresh after any watch event (single toggle, batch season, batch all)
- [ ] Tests cover: progress bar at 0%/50%/100%, progress bar colour changes at 100%, next episode points to correct episode, next episode hidden when all watched, batch mark all (optimistic + revert), progress updates after individual episode toggle

## Notes

The watch progress component should subscribe to watch history mutations so it updates without a full page refetch. "Next Episode" traverses seasons in order (1, 2, 3, ...) and episodes within each season by episode number, skipping specials (season 0) unless no regular episodes are unwatched. The batch "Mark All Watched" is a catch-up feature for shows the user has already finished watching through other means.
