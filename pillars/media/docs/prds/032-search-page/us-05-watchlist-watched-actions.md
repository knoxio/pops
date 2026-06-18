# US-05: Watchlist and Watched Actions on Search Results

> PRD: [PRD-032 Search Page](README.md)
> Status: Done

## Story

As a user browsing search results, I want to add a movie to my watchlist or mark it as watched in a single click, without having to visit the detail page first.

## Acceptance Criteria

### Not-in-library movies

- [ ] A "Watchlist + Library" button appears; clicking it calls `addMovie` and on success calls `watchlist.add` with the returned local id
- [ ] A "Watched + Library" button appears; clicking it calls `addMovie` and on success calls `watchHistory.log` with the returned local id
- [ ] Both compound buttons are disabled while the primary `addMovie` call is pending

### In-library items

- [ ] A `WatchlistToggle` component is rendered for all in-library items (movies and TV) when the local `mediaId` is known
- [ ] A "Mark Watched" button is rendered for in-library movies only; clicking it calls `watchHistory.log` directly with the local `mediaId`
- [ ] The "Mark Watched" button is not shown for TV shows (episode-level tracking is on the detail page)

### Session state

- [ ] The local id returned by a compound `addMovie` call is stored in session state so subsequent in-session actions (e.g. Mark Watched after Watchlist + Library) have the id available without a library query refetch

## Implementation Notes

- `SearchResultCard` receives `onAddToWatchlistAndLibrary`, `onMarkWatchedAndLibrary` (not-in-library) and `onMarkWatched` (in-library) as prop callbacks
- `SearchPage` manages `sessionMovieLocalIds: Map<tmdbId, localId>` to cache ids from compound add responses
- TV shows do not receive `onAddToWatchlistAndLibrary` or `onMarkWatchedAndLibrary` — the search page only supports episode-level watch logging via the TV show detail page
