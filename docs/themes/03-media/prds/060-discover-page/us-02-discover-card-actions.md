# US-02: Discover card action buttons

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want consistent action buttons on every discover card so I can quickly act on any movie I see.

## Acceptance Criteria

- [ ] `DiscoverCard` component shows 5 hover actions: Add to Library (+), Add to Watchlist (Bookmark), Mark as Watched (Eye), Request (Download), Not Interested (X)
- [ ] "Add to Library" hidden when movie already owned
- [ ] "Not Interested" calls `media.discovery.dismiss` mutation (backend, not localStorage)
- [ ] "Mark as Watched" adds to library (idempotent) then logs watch event with current timestamp
- [ ] "Owned" badge on cards for movies in the library
- [ ] "Watched" badge on cards for movies with a watch_history entry
- [ ] Each action shows loading spinner during mutation, button disabled to prevent double-clicks
- [ ] Toast notification confirms each action with movie title
- [ ] After any action, relevant discover queries are invalidated so badges/lists update
- [ ] Remove existing localStorage-based dismiss logic from DiscoverCard
- [ ] Tests cover: each action triggers correct mutation, badges display, loading states

## Notes

The "Watched" badge requires knowing which tmdbIds have watch_history entries. The trending/recommendations endpoints already return `inLibrary` — extend to also return `isWatched`. This may require joining watch_history in the backend or a separate batch lookup.
