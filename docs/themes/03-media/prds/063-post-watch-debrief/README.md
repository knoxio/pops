# PRD-063: Post-Watch Debrief

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Not started

## Overview

A focused rapid-fire comparison session for a movie the user just watched. One comparison per active dimension, each against a well-chosen opponent near the median score for that dimension. The debrief quickly calibrates the new movie's position across all dimensions while the user's opinion is freshest.

## Trigger & Notification

The debrief is manual but prompted:

- **History page**: a "Debrief" button appears on the movie tile for any recently watched movie that hasn't been debriefed
- **Library page**: a notification badge/banner shows unwatched debriefs (e.g. "3 movies to debrief"). Dismissible per movie
- **Movie detail page**: "Debrief this movie" button when the movie has watch history but no debrief record

A movie is considered "debriefed" once it has at least one comparison per active dimension. The debrief button disappears after completion (or manual dismissal).

## Debrief Flow

Route: `/media/debrief/:movieId`

1. **Header**: movie poster, title, year. "Debrief: {Movie Title}" heading
2. **Dimension indicator**: shows current dimension name + progress (e.g. "3 of 10")
3. **Comparison card**: the debrief movie on the left, opponent on the right. Standard pick-A / pick-B / draw-tier buttons
4. **One comparison per dimension**: after the user picks, advance to the next dimension
5. **Order**: dimensions presented sequentially (by sort_order), or user can skip a dimension
6. **Bail out**: "Done for now" button at any point. Completed dimensions are saved. Remaining dimensions still show the debrief prompt
7. **Completion**: after all dimensions, show a summary: per-dimension result (won/lost/draw tier) and new score for each

## Opponent Selection

For each dimension, select an opponent near the **median score** (~60th percentile on a 0–100 normalized scale). The question is: "Is this movie roughly better or worse than average?"

Selection algorithm:
1. Get all scored movies for this dimension (exclude the debrief movie itself)
2. Find the median score
3. Select the movie closest to the median that the debrief movie hasn't been compared against in this dimension
4. If all median-range movies are exhausted, expand the search range outward
5. If no eligible opponent exists, skip this dimension

The opponent should NOT be:
- The same movie
- Excluded from this dimension
- A movie with all watch events blacklisted
- A movie the debrief movie was already compared against in this dimension during the current debrief

## Data Model

### debrief_status

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, auto-increment | |
| `media_type` | TEXT | NOT NULL | `'movie'` |
| `media_id` | INTEGER | NOT NULL | |
| `dimension_id` | INTEGER | NOT NULL, FK | |
| `debriefed` | INTEGER | NOT NULL, DEFAULT 0 | 1 = comparison recorded for this dimension |
| `dismissed` | INTEGER | NOT NULL, DEFAULT 0 | 1 = user dismissed without comparing |
| `created_at` | TEXT | NOT NULL | When the debrief was queued (usually = watch event time) |

UNIQUE index on `(media_type, media_id, dimension_id)`.

Rows are created when a watch event is logged — one row per active dimension. The debrief is "complete" when all rows for a movie have `debriefed = 1` or `dismissed = 1`.

## Business Rules

- A debrief is queued automatically when a new watch event is logged for a movie (one row per active dimension)
- Completing a comparison in the debrief records it via the standard `comparisons.record` path — same ELO update logic
- Draw tiers (High/Mid/Low) are available in the debrief, same as the arena
- The debrief movie's staleness is 0 (just watched)
- Dismissing a debrief dimension sets `dismissed = 1` — the prompt disappears, no comparison recorded
- Dismissing all dimensions (or the entire debrief) hides the notification
- If a new dimension is added after a movie was debriefed, a new debrief row is NOT created retroactively
- The debrief route is accessible even for movies watched long ago — the "Debrief" button is on any movie with incomplete debrief rows

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Movie has no eligible opponents for a dimension | Skip that dimension, mark as dismissed with reason |
| All dimensions debriefed already | Debrief button hidden, notification absent |
| User watches the same movie again | New debrief rows created (reset debriefed/dismissed to 0) |
| Dimension deactivated after debrief queued | Row stays but is ignored by the UI (only show active dimensions) |
| User navigates away mid-debrief | Completed dimensions saved, remaining still pending |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-debrief-schema](us-01-debrief-schema.md) | debrief_status table, auto-queue on watch event | Not started | Yes |
| 02 | [us-02-opponent-selection](us-02-opponent-selection.md) | Median-score opponent selection per dimension | Not started | Yes |
| 03 | [us-03-debrief-api](us-03-debrief-api.md) | tRPC endpoints: getDebrief, recordDebriefComparison, dismissDimension | Not started | Blocked by us-01, us-02 |
| 04 | [us-04-debrief-page](us-04-debrief-page.md) | Debrief route with comparison cards, dimension progress, bail-out, summary | Not started | Blocked by us-03 |
| 05 | [us-05-debrief-notifications](us-05-debrief-notifications.md) | History tile button, library banner, detail page button for pending debriefs | Not started | Blocked by us-03 |

US-01 and US-02 can parallelise. US-04 and US-05 can parallelise once US-03 is done.

## Out of Scope

- TV show debriefs (movie-only for now)
- Auto-starting debrief on watch event (manual trigger, prompted by notification)
- Debrief analytics or progress tracking beyond the badge/banner
