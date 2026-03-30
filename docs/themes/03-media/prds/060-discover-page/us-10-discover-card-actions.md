# US-10: Discover Card Actions

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want consistent action buttons on every discover card so that I can quickly add to library, watchlist, mark as watched, request for download, or dismiss — regardless of which section the card appears in.

## Acceptance Criteria

- [ ] Every `DiscoverCard` in every section has the following hover actions:

| Icon | Action | Behaviour |
|------|--------|-----------|
| `+` (Plus) | Add to Library | Creates movie in POPS via TMDB. Toast confirms. Card updates to show "Owned" badge |
| Bookmark | Add to Watchlist | Adds to library (idempotent) then adds to watchlist. Toast confirms |
| Eye | Mark as Watched | Adds to library (idempotent) then logs watch event with current timestamp. Toast confirms |
| Download | Request | Opens Radarr request flow (existing `RequestMovieButton` component) |
| X | Not Interested | Dismisses movie via `media.discovery.dismiss` mutation. Card animates out. Excluded from all sections |

- [ ] Movies already in the library show an "Owned" badge (top-right corner)
- [ ] Movies already watched show a "Watched" badge (replaces or supplements "Owned")
- [ ] The "Add to Library" button is hidden when the movie is already owned
- [ ] All actions show a loading spinner while the mutation is in flight
- [ ] All actions disable the button during loading to prevent double-clicks
- [ ] Toast notifications confirm each action with the movie title
- [ ] After adding to library or marking as watched, the discover queries are invalidated so badges update
- [ ] `DiscoverCard` props include: `onAddToLibrary`, `onAddToWatchlist`, `onMarkWatched`, `onNotInterested`, with loading state booleans for each
- [ ] Tests cover: each action triggers correct mutation, loading states, badge display, disabled during loading

## Notes

The "Mark as Watched" action is the key differentiator for the backfill use case — users scrolling through trending or recommendations will recognise movies they've seen and can log them in one tap. This is distinct from the existing movie detail page's "Mark as Watched" which requires navigating to the detail page first. The Watched badge helps users distinguish which movies in a section they've already tracked, reducing redundant scanning.
