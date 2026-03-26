# US-04: Tracking and comparison API

> PRD: [028 — Media Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want tRPC procedures for watchlist management, watch history logging (with auto-removal and batch operations), and pairwise comparisons (with Elo scoring and rankings) so that media tracking and rating features have a complete API layer.

## Acceptance Criteria

### Watchlist

- [x] `media.watchlist.list` — returns all entries ordered by priority ASC then addedAt DESC, enriched with media metadata (title, poster)
- [x] `media.watchlist.get` — returns single entry by id
- [x] `media.watchlist.add` — creates entry with mediaType + mediaId; on CONFLICT (duplicate), returns existing entry unchanged
- [x] `media.watchlist.update` — updates priority and/or notes by id
- [x] `media.watchlist.reorder` — accepts array of { id, priority }, updates all in a single transaction
- [x] `media.watchlist.remove` — deletes entry by id
- [x] Watchlist validates mediaType is "movie" or "tv_show"
- [x] Watchlist validates that the referenced media item exists

### Watch History

- [x] `media.watchHistory.list` — paginated, filterable by mediaType
- [x] `media.watchHistory.listRecent` — returns last N entries enriched with metadata; for episodes includes show name and show poster
- [x] `media.watchHistory.get` — returns single entry by id
- [x] `media.watchHistory.log` — creates watch history entry; when completed=1 for a movie, auto-removes that movie from watchlist; when completed=1 for an episode, checks if ALL show episodes are watched and auto-removes show from watchlist if so
- [x] `media.watchHistory.progress` — for a tvShowId, returns overall completion percentage and per-season completion percentages
- [x] `media.watchHistory.batchProgress` — batch version of progress for multiple tvShowIds
- [x] `media.watchHistory.batchLog` — marks all episodes in a season or show as watched in one operation
- [x] `media.watchHistory.delete` — removes entry by id
- [x] Watch history validates mediaType is "movie" or "episode"

### Comparisons

- [x] `media.comparisons.listDimensions` — returns all dimensions ordered by sortOrder
- [x] `media.comparisons.createDimension` — creates dimension with name, description, sortOrder
- [x] `media.comparisons.updateDimension` — updates dimension fields (name, description, active, sortOrder)
- [x] `media.comparisons.record` — validates winnerId matches either A or B; inserts comparison record and updates both items' Elo scores in a single transaction using K=32
- [x] `media.comparisons.listForMedia` — returns all comparisons involving a specific media item
- [x] `media.comparisons.getRandomPair` — returns two watched movies for a given dimension, avoids recently compared pairs, returns null if fewer than 2 watched movies exist
- [x] `media.comparisons.scores` — returns all dimension scores for a specific media item
- [x] `media.comparisons.rankings` — returns ranked list per dimension, or overall ranking (average across active dimensions) when no dimension specified

### Elo Scoring

- [x] Starting score is 1500.0 for new items
- [x] K-factor is 32
- [x] Both winner and loser scores update atomically in the same transaction
- [x] `comparisonCount` increments for both items on each comparison
- [x] Overall ranking averages scores across all active dimensions only

### Cross-cutting

- [x] Input validation via zod schemas on all procedures
- [x] Tests cover auto-removal from watchlist on movie completion
- [x] Tests cover auto-removal from watchlist when all show episodes are completed
- [x] Tests cover Elo score calculation correctness
- [x] Tests cover getRandomPair edge cases (no movies, one movie, recently compared)
- [x] Tests cover batch operations (reorder, batchLog, batchProgress)

## Notes

Auto-removal on watch completion is a side effect of `log` — the procedure inserts the history record and then conditionally removes from watchlist in the same transaction. For episodes, checking "all episodes watched" requires joining through seasons to the show, then querying the watchlist for that show.

The Elo calculation: expected score = 1 / (1 + 10^((opponent - self) / 400)), new score = old + K * (actual - expected), where actual = 1 for winner, 0 for loser.
