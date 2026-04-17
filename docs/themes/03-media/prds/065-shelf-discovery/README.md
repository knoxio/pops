# PRD-065: Shelf-Based Discovery

> Epic: [05 — Discovery & Recommendations](../../epics/05-discovery-recommendations.md)
> Status: Done

## Overview

A dynamic shelf pool system for the discover page. Instead of showing the same 9 hardcoded sections in the same order every time, the page is assembled per session from a pool of 27 shelf definitions. Each session selects 10-15 shelves, orders them by relevance and variety, and jitters item positions within each shelf. The result: a Netflix-like experience where the page feels different every time you open it.

## Shelf System Architecture

### Shelf interface

```typescript
interface ShelfDefinition {
  id: string; // "because-you-watched", "hidden-gems", etc.
  template: boolean; // true = parametrized (generates multiple instances)
  category: 'seed' | 'profile' | 'tmdb' | 'local' | 'context' | 'external';
  generate(profile: PreferenceProfile): ShelfInstance[]; // one instance per seed, or one for static
}

interface ShelfInstance {
  shelfId: string; // "because-you-watched:42" or "hidden-gems"
  title: string; // "Because you watched Interstellar"
  subtitle?: string; // "Movies similar to your recent watch"
  emoji?: string; // "🎬" for theming
  query(options: { limit: number; offset: number }): Promise<DiscoverResult[]>;
  score: number; // relevance to this user (0-1)
  seedMovieId?: number; // for seed-based shelves
}
```

### Shelf pool (27 definitions)

#### Seed-based templates (8 — each generates multiple instances)

| ID                    | Template                          | Seed source                                                 | TMDB endpoint                                                |
| --------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `because-you-watched` | "Because you watched {Movie}"     | Recent watches (weighted toward last 30 days, random older) | `/movie/{id}/recommendations`                                |
| `more-from-director`  | "More from {Director}"            | Directors of high-ELO movies                                | `/discover/movie?with_crew={id}`                             |
| `more-from-actor`     | "More from {Actor}"               | Lead actors of top-rated movies                             | `/discover/movie?with_cast={id}`                             |
| `best-in-genre`       | "Best in {Genre}"                 | Genres from affinity profile                                | `/discover/movie?with_genres={id}&sort_by=vote_average.desc` |
| `genre-crossover`     | "{Genre} × {Genre}"               | Top genre pairs (not related)                               | `/discover/movie?with_genres={id1},{id2}`                    |
| `top-dimension`       | "Top {Dimension} picks"           | ELO dimensions                                              | Local: movies ranked highest on that dimension               |
| `dimension-inspired`  | "You loved {Movie}'s {Dimension}" | High-scoring movie + dimension                              | `/movie/{id}/recommendations` filtered by dimension affinity |
| `context`             | "{Context Title}"                 | Time/date/season triggers                                   | `/discover/movie?with_genres={ids}&with_keywords={ids}`      |

#### Static shelves (19)

| ID                      | Title                           | Source           | Query logic                                                 |
| ----------------------- | ------------------------------- | ---------------- | ----------------------------------------------------------- |
| `trending-tmdb`         | "Trending"                      | TMDB             | `/trending/movie/{week\|day}`                               |
| `trending-plex`         | "Trending on Plex"              | Plex Discover    | Cloud trending, hidden if disconnected                      |
| `new-releases`          | "New Releases"                  | TMDB             | Released in last 30 days, filtered by genre affinity        |
| `hidden-gems`           | "Hidden Gems"                   | TMDB             | Vote count 50-500, vote average > 7.0, in top genres        |
| `critics-vs-audiences`  | "Critics Love, Audiences Split" | TMDB             | High vote average + low popularity (proxy for polarizing)   |
| `short-watch`           | "Quick Watch"                   | Local            | Runtime < 100min, unwatched, scored                         |
| `long-epic`             | "Epic Watch"                    | Local            | Runtime > 150min, unwatched, scored                         |
| `worth-rewatching`      | "Worth Rewatching"              | Local            | Watched 6+ months ago, above-median ELO                     |
| `from-your-server`      | "Ready on Your Server"          | Local            | Unwatched library, scored by profile                        |
| `from-your-watchlist`   | "From Your Watchlist"           | Local + TMDB     | Similar to recent watchlist items                           |
| `franchise-completions` | "Finish the Series"             | TMDB Collections | Partially watched collections (e.g. 2 of 3 LOTR)            |
| `recently-added`        | "Recently Added"                | Local            | Newest by created_at, unwatched                             |
| `award-winners`         | "Award Winners"                 | TMDB             | Keywords: academy award, golden globe, in top genres        |
| `decade-picks`          | "Best of the {Decade}"          | TMDB             | Year range of decade with most watches                      |
| `comfort-picks`         | "Comfort Picks"                 | Local            | Watched 2+ times or frequently draw-high'd                  |
| `polarizing`            | "Love It or Hate It"            | Local            | High variance across ELO dimensions                         |
| `undiscovered`          | "Undiscovered in Your Library"  | Local            | In library, zero comparisons, unwatched                     |
| `friend-proof`          | "Crowd Pleasers"                | Local            | High Entertainment + high Rewatchability dimensions         |
| `recommendations`       | "Recommended for You"           | Local + TMDB     | Top ELO movies → TMDB recs, merged, scored (existing logic) |

## Session Assembly Algorithm

Each page load runs the assembly:

1. **Generate instances**: call `generate()` on all 27 shelf definitions → ~50-100 shelf instances
2. **Filter empty**: discard instances where `query()` would return 0 results (fast pre-check)
3. **Score each instance**:
   - Relevance: user affinity score (0-1)
   - Freshness: `1 / (1 + timesShownRecently)` from `shelf_impressions` table
   - Variety bonus: +0.2 if category differs from already-selected shelves
4. **Select 10-15 shelves**: weighted random sampling from scored instances
5. **Order**: highest-scoring first, but with variety constraint — no two shelves from same category adjacent
6. **Jitter items**: within each shelf, multiply each item's score by random [0.8, 1.2] before sorting
7. **Record impressions**: log which shelves were shown in `shelf_impressions`

### Variety constraints

- Maximum 3 seed-based shelves per session
- Maximum 2 genre-related shelves (best-in-genre, genre-crossover)
- Maximum 1 local-only shelf per 3 shelves (mix in TMDB shelves between)
- Always include at least 1 "Recommended for You" or "Because you watched" (personal relevance anchor)
- Context shelves (time-based) get a +0.3 relevance boost when active

## Data Model

### shelf_impressions

| Column     | Type    | Constraints        | Description                                  |
| ---------- | ------- | ------------------ | -------------------------------------------- |
| `id`       | INTEGER | PK, auto-increment |                                              |
| `shelf_id` | TEXT    | NOT NULL           | e.g. "because-you-watched:42", "hidden-gems" |
| `shown_at` | TEXT    | NOT NULL           | ISO timestamp                                |

Index on `shelf_id`. Used to compute freshness — shelves shown recently score lower.

Cleanup: rows older than 30 days are deleted on startup or periodically.

## Business Rules

- Session assembly runs on every page load (no caching the shelf selection)
- Item positions within shelves are jittered — same shelf shows different item order each time
- Seed selection for "Because you watched" rotates: 60% from last 30 days watches, 40% random older
- Director/actor shelves require the movie to have TMDB credits data (fetched lazily, cached)
- Franchise detection uses TMDB's `/movie/{id}` response `belongs_to_collection` field
- "Comfort picks" counts watch events — 2+ completed watches of the same movie = comfort
- "Polarizing" measures score variance: `MAX(score) - MIN(score)` across dimensions, threshold > 200 points
- Shelves with fewer than 3 results are discarded during filtering
- The preference profile (genre affinity, dimension weights) is computed once per session and shared across all shelf scorers
- Dismissed movies are filtered from all shelves (existing dismissed_discover table)

## Edge Cases

| Case                                       | Behaviour                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| New user, no watches                       | Only trending, new releases, context shelves shown. No seed-based shelves           |
| Small library (< 10 movies)                | Local shelves may be empty — filter them out, lean on TMDB shelves                  |
| No comparisons                             | Dimension-based shelves hidden, genre shelves use watch distribution instead of ELO |
| TMDB API failure                           | Affected shelves silently removed from session. Local shelves unaffected            |
| Plex disconnected                          | Plex shelf hidden (existing behavior)                                               |
| All shelves shown recently (low freshness) | Freshness weight floors at 0.1 (never zero), least-recently-shown shelves win       |
| Session takes > 2s to assemble             | Pre-check queries should be fast. If slow, reduce candidate pool to 30 instances    |

## User Stories

| #   | Story                                                               | Summary                                                                                                               | Status | Parallelisable                               |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| 01  | [us-01-shelf-interface](us-01-shelf-interface.md)                   | ShelfDefinition + ShelfInstance interfaces, shelf registry, generate() contract                                       | Done   | No (first)                                   |
| 02  | [us-02-session-assembly](us-02-session-assembly.md)                 | Assembly algorithm: score, select, order, variety constraints, jitter                                                 | Done   | Blocked by us-01                             |
| 03  | [us-03-shelf-impressions](us-03-shelf-impressions.md)               | shelf_impressions table, record shown shelves, compute freshness, cleanup                                             | Done   | Yes                                          |
| 04  | [us-04-seed-shelves-watch](us-04-seed-shelves-watch.md)             | "Because you watched {Movie}" shelf: rotation logic, TMDB recs per seed                                               | Done   | Blocked by us-01                             |
| 05  | [us-05-seed-shelves-credits](us-05-seed-shelves-credits.md)         | Director + actor shelves: TMDB credits lookup, filmography query, caching                                             | Done   | Blocked by us-01                             |
| 06  | [us-06-seed-shelves-genre](us-06-seed-shelves-genre.md)             | Genre, genre×genre, dimension-based, dimension+movie shelves                                                          | Done   | Blocked by us-01                             |
| 07  | [us-07-tmdb-discovery-shelves](us-07-tmdb-discovery-shelves.md)     | New releases, hidden gems, critics vs audiences, award winners, decade picks                                          | Done   | Blocked by us-01                             |
| 08  | [us-08-local-library-shelves](us-08-local-library-shelves.md)       | From server, recently added, short/long watch, comfort, undiscovered, polarizing, friend-proof, franchise completions | Done   | Blocked by us-01                             |
| 09  | [us-09-migrate-existing-shelves](us-09-migrate-existing-shelves.md) | Migrate current 9 sections (trending, recs, genre spotlight, etc.) into shelf definitions                             | Done   | Blocked by us-01                             |
| 10  | [us-10-assembly-api](us-10-assembly-api.md)                         | tRPC endpoint: assembleDiscoverPage returns ordered shelf list with first page of items each                          | Done   | Blocked by us-02, us-03, us-04 through us-09 |
| 11  | [us-11-shelf-pagination](us-11-shelf-pagination.md)                 | tRPC endpoint: getShelfPage returns next page of items for a specific shelf instance                                  | Done   | Blocked by us-10                             |
| 12  | [us-12-dynamic-page-renderer](us-12-dynamic-page-renderer.md)       | Frontend: render N shelf sections dynamically from assembly response, lazy load off-screen                            | Done   | Blocked by us-10                             |
| 13  | [us-13-shelf-refresh](us-13-shelf-refresh.md)                       | Frontend: "Refresh" button re-runs assembly for a new shelf selection without full page reload                        | Done   | Blocked by us-12                             |

US-01 and US-03 can parallelise. US-04 through US-09 (all shelf implementations) can parallelise after US-01. US-10 through US-13 are sequential.

## Out of Scope

- TV show shelves (movie-only for now)
- Collaborative filtering (requires multi-user data)
- AI-generated shelf titles or descriptions
- Editorial/curated shelves (all algorithmic)
- Streaming availability data (no API integration with Netflix/etc.)

## Drift Check

last checked: never
