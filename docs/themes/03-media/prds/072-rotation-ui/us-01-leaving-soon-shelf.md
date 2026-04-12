# US-01: Leaving Soon Shelf

> PRD: [Rotation UI](README.md)

## Description

As a user, I want to see which movies are about to leave my library — on both the Library page and the Discover page — so that I can watch them before they're removed or choose to keep them.

## Acceptance Criteria

- [ ] A "Leaving Soon" shelf appears on the movie library page when there are movies with `rotation_status = 'leaving'`
- [ ] The same "Leaving Soon" shelf appears on the Discover page, registered in the shelf registry (PRD-065 pattern). Category: `local`. It is pinned (always shown when leaving movies exist, not subject to random shelf assembly)
- [ ] On both pages, movies are sorted by `rotation_expires_at` ASC (soonest departures first)
- [ ] Each card shows a countdown badge: "Leaving in X days", "Last day" (< 24h), or "Leaving tomorrow" (< 48h)
- [ ] Badge colour: red when ≤ 3 days, amber when ≤ 7 days, neutral when > 7 days
- [ ] The countdown badge also appears on movie cards elsewhere in the app (search, detail page, watchlist) when that movie is leaving
- [ ] Each card has a "Keep" action that clears the leaving status (calls `rotation.cancelLeaving`)
- [ ] Both shelves are hidden when rotation is disabled or no movies are leaving
- [ ] Shelf uses the existing `MediaCard` component — badge is an overlay, not a new card type

## Notes

On the Library page, the shelf sits near the top — above the general library grid, below any pinned/featured section. On the Discover page, it's a pinned shelf at the top of the page (above the randomly assembled shelves). The shelf definition follows the `ShelfDefinition` interface from PRD-065 and registers via `registerShelf()`. The "Keep" action should be a quick-action (icon button on hover or swipe) — not a full modal flow.
