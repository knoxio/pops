# Idea: Watch History page polish

Forward-looking refinements specced for the watch-history page (`prds/watch-history`) that are NOT in the code today. Build later.

## Completed-only history list

The PRD originally claimed only completed watches (`completed=1`) appear on the history page. The `listRecent` service does **not** filter on `completed` — every row is returned regardless. The `watch_history.completed` column exists and the generic `list` service already supports a `completed` filter, so this is a small change:

- Add a `completed` filter to `listRecent`'s `RecentWatchHistoryFilters` and where-clause.
- Default the history page to `completed=1`, filtering in-progress events out of the chronological list.

## URL-driven, bookmarkable state

Page filter and pagination are in-memory `useState` today, so the view isn't shareable or restorable on reload.

- Make the active filter the source of truth via a `?type=` query param.
- Mirror the current page/offset into the URL (`?page=` or `?offset=`).
- Restore filter + page from the URL on mount.

## Page-size selector

Page size is hard-coded to 50. Add a selector (20 / 50 / 100) and thread the chosen size through the `limit` query param and the pagination math.

## Page-numbered pagination

Today the page shows Previous/Next and a "Showing N of M" count. Replace with current-page / total-pages display and (optionally) numbered page jumps, computed from `total` and the page size.

## Relative timestamps with tooltip

Watched dates render as absolute locale date-times. Switch the primary display to relative time ("2 days ago") with the full ISO/locale date on hover/tooltip.

## Swipe-to-delete on mobile

Mobile entries expose a persistent delete icon button. Add a swipe gesture as the mobile-native affordance for delete (desktop already reveals the button on hover).
