# PRD-037: Ratings & Comparisons

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Partial

## Overview

Build a pairwise comparison system per [ADR-010](../../../../architecture/adr-010-comparison-system.md). Two watched movies are presented side by side across taste dimensions, the user picks a winner, and Elo scores update. A rankings page shows the leaderboard. A quick-pick flow helps decide what to watch.

## Routes

| Route | Page |
|-------|------|
| `/media/compare` | Compare Arena |
| `/media/rankings` | Rankings Leaderboard |
| `/media/quick-pick` | Quick Pick |

## UI Components

### Compare Arena

| Element | Detail |
|---------|--------|
| Movie pair | Two poster cards side by side with title, year, and poster |
| Dimension label | Prominent text above the pair: "Which has better {Dimension}?" |
| Pick action | Click/tap a movie card to pick it as the winner |
| Skip button | "Skip" below the pair — fetches a new random pair |
| Progress indicator | Current dimension name and rotation position |
| Minimum threshold | "Not enough watched movies" message when fewer than 2 watched movies exist |

### Rankings Page

| Element | Detail |
|---------|--------|
| Dimension selector | Dropdown: "Overall" (default) + each active dimension |
| Ranked list | Rank number, poster thumbnail, title, Elo score, comparison count |
| Overall calculation | Average score across all active dimensions |
| Media type filter | Movies only (TV comparisons out of scope) |
| Empty state | "No comparisons yet" with CTA to compare arena |

### Quick Pick

| Element | Detail |
|---------|--------|
| Random selection | Configurable count (default 3) of unwatched movies |
| Card display | Poster cards with title and "Watch This" action button |
| Refresh button | "Show me others" fetches a new random set |
| Empty state | "Nothing unwatched in your library" with CTA to search |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.comparisons.getRandomPair` | Fetch two watched movies for the arena, avoiding recently compared pairs |
| `media.comparisons.record` | Record a comparison and update Elo scores |
| `media.comparisons.listDimensions` | Fetch active dimensions for the arena cycle and rankings selector |
| `media.comparisons.rankings` | Fetch ranked list for a specific dimension or overall |
| `media.comparisons.createDimension` | Add a new comparison dimension |
| `media.comparisons.updateDimension` | Edit or deactivate a dimension |

## Elo Algorithm

| Parameter | Value |
|-----------|-------|
| K-factor | 32 |
| Starting score | 1500.0 |
| Expected score formula | `1 / (1 + 10^((opponentScore - score) / 400))` |
| Score update | `oldScore + K * (actual - expected)` |
| Winner actual | 1 |
| Loser actual | 0 |
| Transaction | Both scores updated in a single transaction |

## Default Comparison Dimensions

| Dimension | Description |
|-----------|-------------|
| Cinematography | Visual quality, shot composition, camera work |
| Entertainment | How engaging and enjoyable to watch |
| Emotional Impact | How strongly it affected you emotionally |
| Rewatchability | How much you'd want to watch it again |
| Soundtrack | Quality and effectiveness of music and sound design |

## Business Rules

- Only watched movies (`completed=1` in watch_history) are eligible for comparison
- Arena rotates through all active dimensions — one dimension per comparison
- Recently compared pairs are avoided (default: last 10 pairs)
- Both Elo scores (winner and loser) update in a single database transaction
- "Overall" ranking is the average score across all active dimensions for each movie
- Movies with zero comparisons start at 1500.0 and sort alphabetically in rankings
- Dimensions can be added, edited, or deactivated — deactivated dimensions are excluded from overall calculations
- Deactivated dimensions retain their comparison history and scores (not deleted)
- Quick pick shows only movies NOT in watch_history with `completed=1`

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Fewer than 2 watched movies | Arena shows "Not enough watched movies" message with CTA to watch history |
| All pairs recently compared | Reset avoidance window and serve a repeated pair |
| New dimension added | All movies start at 1500.0 for that dimension |
| Dimension deactivated | Excluded from overall ranking; existing scores preserved |
| No unwatched movies for quick pick | "Nothing unwatched" with CTA to search page |
| Rankings with no comparisons | All movies at 1500.0, sorted alphabetically by title |
| Movie deleted from library | Comparisons and scores for that movie remain (orphaned but harmless) |
| Same pair for multiple dimensions | Allowed — each dimension is independent |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-compare-arena](us-01-compare-arena.md) | Compare arena page with random pair display, dimension label, pick-winner interaction, skip, pair avoidance | Partial | Blocked by us-02 |
| 02 | [us-02-elo-scoring](us-02-elo-scoring.md) | Elo algorithm implementation (K=32, 1500 start), transaction-safe score updates, record comparison | Partial | Yes |
| 03 | [us-03-rankings-page](us-03-rankings-page.md) | Rankings page with dimension selector, ranked list (poster, title, score, count), overall average | Partial | Yes (parallel with us-01) |
| 04 | [us-04-dimension-management](us-04-dimension-management.md) | CRUD for comparison dimensions, active/inactive toggle, sort order | Partial | Yes |
| 05 | [us-05-quick-pick](us-05-quick-pick.md) | Quick pick page with random unwatched movies, configurable count, "Watch This" action | Partial | Yes |
| 06 | [us-06-comparison-history](us-06-comparison-history.md) | Comparison history list, delete with Elo recalculation, undo toast, dimension filter | Not started | Yes |
| 07 | [us-07-dimension-weights](us-07-dimension-weights.md) | Per-dimension weight for overall ranking, weight slider in dimension management UI | Done | Yes |
| 08 | [us-08-arena-watchlist-filter](us-08-arena-watchlist-filter.md) | Add to watchlist from arena, exclude watchlisted movies from pair selection | Not started | Yes |

US-01 depends on US-02 (arena needs Elo scoring to record comparisons). US-03 through US-08 can all be built in parallel.

## Verification

- Arena presents two watched movies side by side with the current dimension
- Clicking a movie records the comparison and shows the next pair
- Skip button fetches a new pair without recording
- Elo scores update correctly after each comparison
- Rankings page shows movies ordered by score for selected dimension
- Overall ranking averages active dimension scores
- Dimension management allows adding, editing, and deactivating dimensions
- Quick pick shows random unwatched movies with "Watch This" action
- Edge cases (fewer than 2 movies, no unwatched movies) show appropriate messages

## Out of Scope

- TV show comparisons (complex UX — compare show vs show, season vs season?)
- Smart pair selection based on score uncertainty
- AI-driven comparison prompts
- Radar charts on detail pages (detail pages own their own display)
