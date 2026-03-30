# US-02: WatchlistToggle component

> PRD: [033 — Movie Detail Page](README.md)
> Status: Partial

## Description

As a user, I want to add or remove a movie from my watchlist with a single click so that I can track what I plan to watch.

## Acceptance Criteria

- [x] WatchlistToggle is a standalone component that accepts a movie ID and renders the appropriate state
- [x] When the movie is not on the watchlist: renders "Add to Watchlist" button (e.g., bookmark outline icon + text)
- [x] When the movie is on the watchlist: renders "In Watchlist" button with a filled/active style (e.g., filled bookmark icon + text)
- [ ] Clicking "Add to Watchlist" optimistically switches to the "In Watchlist" state immediately, then calls `media.watchlist.add` — no optimistic update; state changes after API success
- [ ] Clicking "In Watchlist" optimistically switches to the "Add to Watchlist" state immediately, then calls `media.watchlist.remove` — no optimistic update; state changes after API success
- [ ] If the API call fails, the UI reverts to the previous state and an error toast is displayed — error toast shown but no state revert (state wasn't changed optimistically)
- [ ] Initial state is determined by calling `media.watchlist.status` with the movie ID — uses `media.watchlist.list` + `find()` instead; `media.watchlist.status` endpoint does not exist
- [x] Button is disabled during the initial status check (prevents action before state is known)
- [x] The component is reusable — it can be mounted on any page that has a movie ID (detail page, list items, etc.)
- [ ] Tests cover: initial state loading, optimistic add, optimistic remove, revert on API failure, error toast on failure

## Notes

Optimistic updates are critical for perceived performance — the watchlist toggle should feel instant. Use a mutation with `onMutate` / `onError` rollback pattern (tRPC + React Query or equivalent). The add action sets a default priority on the server side; the component does not need to specify priority.
