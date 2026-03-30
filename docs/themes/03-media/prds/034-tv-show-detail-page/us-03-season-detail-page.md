# US-03: Season detail page

> PRD: [034 — TV Show Detail Page](README.md)
> Status: Partial

## Description

As a user, I want to view a season's episodes with individual watch toggles so that I can track which episodes I have watched and mark them one by one or all at once.

## Acceptance Criteria

- [x] Page renders at `/media/tv/:id/season/:num` and fetches season data via `media.library.getSeason`
- [x] Season header displays: season poster (fallback to show poster), season name ("Season N" or custom name), overview (hidden if empty), air date
- [x] Episode list displays each episode as a row: episode number, name, air date (formatted), runtime (formatted as "Xm"), watch status indicator
- [x] Watch status indicator: filled checkmark if watched, empty circle if not watched
- [x] Clicking the watch indicator toggles the episode's watched state — calls `media.watchHistory.log` to mark watched or `media.watchHistory.delete` to mark unwatched
- [x] Per-episode toggle uses optimistic updates — the indicator changes immediately, reverts on API failure
- [ ] Episodes that have not aired yet (air date in the future) are visually dimmed with an "Upcoming" label and their watch toggle is disabled — no air date comparison; all episodes show the same interactive toggle
- [x] "Mark Season Watched" button calls `media.watchHistory.batchLog` for all unwatched episodes in the season
- [x] "Mark Season Watched" is hidden or disabled when all episodes are already watched
- [ ] "Mark Season Watched" uses optimistic updates — all indicators flip to watched immediately, revert on failure with error toast — no optimistic update; no `onError` handler (silent failure)
- [x] Breadcrumb or back link navigates to the parent show detail page (`/media/tv/:id`)
- [x] Page shows a loading state while data is fetching
- [x] Page shows a 404 state when the season number does not exist for this show
- [ ] Tests cover: episode list renders correctly, per-episode toggle (optimistic + revert), batch mark season watched, upcoming episodes are disabled, 404 for invalid season, breadcrumb navigation

## Notes

The episode list is the core of this page — it should be scannable. Keep the row layout compact. Watch toggle should be the most prominent interactive element per row. The batch operation should show a single toast ("Season N marked as watched") rather than one per episode.
