# US-02: Discover card action buttons

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want context-aware action buttons on every discover card that adapt to the movie's current state so I never see irrelevant actions.

## Acceptance Criteria

### Action buttons (context-aware)

- [x] Every `DiscoverCard` shows hover actions that adapt to the movie's current state
- [x] Button states per movie state:

| State                                     | + (Add)        | Bookmark (Watchlist)                | Eye (Watched)                   | Download (Request) | X (Dismiss) |
| ----------------------------------------- | -------------- | ----------------------------------- | ------------------------------- | ------------------ | ----------- |
| Not in library                            | Add to Library | Add to Watchlist                    | Mark as Watched                 | Request            | Dismiss     |
| In library, not watched, not on watchlist | Hidden         | Add to Watchlist                    | Mark as Watched                 | Request            | Dismiss     |
| In library, on watchlist                  | Hidden         | Remove from Watchlist (filled icon) | Mark as Watched                 | Request            | Dismiss     |
| In library, watched, not on watchlist     | Hidden         | Add to Watchlist                    | Mark as Rewatched (repeat icon) | Request            | Dismiss     |
| In library, watched, on watchlist         | Hidden         | Remove from Watchlist (filled icon) | Mark as Rewatched (repeat icon) | Request            | Dismiss     |

- [x] "Add to Library" disappears immediately after any action that adds the movie (Add, Watchlist, Watched)
- [x] Watchlist button toggles: outline bookmark icon = "Add to Watchlist", filled bookmark icon = "Remove from Watchlist"
- [x] Watched button changes based on state: Eye icon + "Mark as Watched" when unwatched; RotateCw icon + "Mark as Rewatched" when already watched
- [x] "Add to Watchlist" adds to library first (idempotent), then adds to watchlist — one click does both
- [x] "Mark as Watched" adds to library first (idempotent), then logs watch event — one click does both
- [x] "Mark as Rewatched" logs an additional watch event (new timestamp) for an already-watched movie
- [x] "Not Interested" calls `media.discovery.dismiss` mutation (backend, not localStorage)

### Badges

- [x] "Owned" badge for movies in the library (top-right corner)
- [x] "Watched" badge for movies with a watch_history entry (replaces "Owned" when both apply)

### Data requirements

- [x] Backend discover endpoints return three booleans per result: `inLibrary`, `isWatched`, `onWatchlist`
- [x] `isWatched`: true when the movie has at least one completed watch_history entry
- [x] `onWatchlist`: true when the movie is on the media_watchlist
- [x] These flags update in the UI after mutations via query invalidation

### General

- [x] Each action shows loading spinner during mutation, button disabled to prevent double-clicks
- [x] Toast notification confirms each action with movie title
- [x] After any action, relevant discover queries are invalidated so badges and button states update
- [x] Remove existing localStorage-based dismiss logic from DiscoverCard
- [x] Tests cover: each button state combination from the table above, toggle behaviours, badge display, loading states

## Notes

The backend needs to return `inLibrary`, `isWatched`, and `onWatchlist` per discover result. The `inLibrary` check already exists (TMDB ID set lookup). For `isWatched`, build a Set of watched movie IDs by joining watch_history where mediaType="movie". For `onWatchlist`, build a Set of watchlist movie IDs from media_watchlist where mediaType="movie". Compute all three sets once per request and pass to the `toDiscoverResults` mapper.
