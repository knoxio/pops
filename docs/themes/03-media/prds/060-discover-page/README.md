# PRD-060: Discover Page

> Epic: [05 — Discovery & Recommendations](../../epics/05-discovery-recommendations.md)
> Status: Not started

## Overview

Build a multi-section discovery page that serves three distinct roles: finding new movies, backfilling watch history, and choosing what to watch next. Each section is a horizontal scroll row powered by a different data source and algorithm. Sections are personalised using comparison data, watch history, genre preferences, and contextual signals.

## Routes

| Route | Page |
|-------|------|
| `/media/discover` | Discovery Page |

## Page Roles

| Role | User intent | Key action |
|------|-------------|------------|
| **Discovery** | Find something new I haven't heard of | Add to Watchlist |
| **Backfill** | Recognise a movie I've already watched | Mark as Watched (adds to library + logs watch) |
| **Next watch** | Pick something to watch tonight from what I own | Open detail page / play on Plex |

## Sections

Each section is a `HorizontalScrollRow` with Load More / infinite scroll.

### 1. Recommended for You

| Aspect | Detail |
|--------|--------|
| Source | Top 10-100 library movies by ELO score → TMDB recommendations for each |
| Algorithm | Fetch TMDB `/movie/{id}/recommendations` for each source, merge, deduplicate by tmdbId, score against preference profile |
| Scoring | Genre affinity weighted average (from comparisons or watch history fallback), scaled to 50-98% |
| Cold start | Hidden below 5 comparisons; show CTA to compare arena |
| Subtitle | "Based on {source movie titles}" |

### 2. Genre Spotlight

| Aspect | Detail |
|--------|--------|
| Source | User's top-rated genres (from comparison ELO) → TMDB discover by genre |
| Algorithm | Pick 2-3 genres with variety (not just the single top genre). For each, fetch TMDB `/discover/movie?with_genres={id}&sort_by=vote_average.desc` |
| Display | One sub-row per genre: "Best in Action", "Best in Sci-Fi", etc. |
| Cold start | Falls back to watch history genre distribution if no comparisons |

### 3. From Your Watchlist

| Aspect | Detail |
|--------|--------|
| Source | POPS watchlist items → TMDB recommendations for each |
| Algorithm | For each watchlist movie, fetch TMDB similar movies. Merge, deduplicate, exclude items already in library or on watchlist |
| Subtitle | "Because {watchlist movie} is on your list" |

### 4. Trending on TMDB

| Aspect | Detail |
|--------|--------|
| Source | TMDB trending API (`/trending/movie/{timeWindow}`) |
| Algorithm | Pure TMDB popularity. No personalisation. Day/week toggle |
| Pagination | Load More with deduplication by tmdbId |

### 5. Trending on Plex

| Aspect | Detail |
|--------|--------|
| Source | Plex Discover cloud API (if connected) |
| Algorithm | What's popular across Plex users globally |
| Fallback | Hidden when Plex not connected |

### 6. Rewatch Suggestions

| Aspect | Detail |
|--------|--------|
| Source | POPS watch history + comparison scores |
| Algorithm | Movies watched 6+ months ago with high ELO scores. Sorted by score descending, limited to 20 |
| Subtitle | "Movies you loved — worth another watch" |

### 7. From Your Server

| Aspect | Detail |
|--------|--------|
| Source | Movies in POPS library that exist in the local Plex library (unwatched) |
| Algorithm | Filter library to unwatched movies available on Plex. Score by preference profile. Sorted by match percentage |
| Subtitle | "Ready to watch on your server" |

### 8. Context-Aware Picks

| Aspect | Detail |
|--------|--------|
| Source | TMDB discover API with curated keyword/genre filters |
| Algorithm | Time-of-day and calendar-aware. Rotate through contextual collections: |
| Collections | "Date Night" (romance + comedy), "Sunday Flicks" (drama + comfort), "Halloween" (horror, Oct only), "Christmas" (holiday, Dec only), "Oscar Winners" (award-tagged), "Rainy Day" (feel-good), "Late Night" (thriller, after 10pm) |
| Rotation | Show 1-2 contextual rows based on current date/time. Static keyword-to-genre mappings, no AI needed for v1 |

## Discover Card Actions

Each card in every section has these hover actions:

| Icon | Action | Effect |
|------|--------|--------|
| `+` | Add to Library | Creates movie in POPS via TMDB metadata |
| Bookmark | Add to Watchlist | Adds to library (idempotent) then adds to watchlist |
| Eye | Mark as Watched | Adds to library (idempotent) then logs watch event |
| Download | Request | Sends to Radarr for download |
| X | Not Interested | Dismisses from all sections, persists across sessions |

Movies already in the library show an "Owned" badge. Movies already watched show a "Watched" badge.

## Not Interested Persistence

| Aspect | Detail |
|--------|--------|
| Storage | `dismissed_discover` table: `tmdb_id INTEGER PRIMARY KEY, dismissed_at TEXT` |
| Scope | Dismissed movies are excluded from ALL sections on the discover page |
| API | `media.discovery.dismiss(tmdbId)` mutation, `media.discovery.getDismissed()` query |
| Undo | Not required for v1 (can clear via settings or direct DB) |

## Preference Profile

Displayed at the bottom of the page. Shows:
- Genre distribution (bar chart from watch history)
- Genre affinity scores (from comparison ELO)
- Dimension weights (from comparison patterns)
- Total movies watched, total comparisons

## Business Rules

- Each section fetches data independently — one section's failure does not affect others
- Movies dismissed via "Not Interested" are excluded from all sections
- "Mark as Watched" adds to library first (idempotent), then logs watch with current timestamp
- Sections with zero results are hidden (not shown as empty)
- Plex-dependent sections are hidden when Plex is not connected
- Context-aware sections only show when the time/date matches their trigger
- All sections support Load More / infinite scroll where the data source allows pagination

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Empty library | Only Trending and Context-Aware visible |
| No comparisons | Recommendations hidden, genre spotlight uses watch history |
| No watch history | Rewatch hidden, genre spotlight uses library composition |
| Plex not connected | "Trending on Plex" and "From Your Server" hidden |
| All recommendations dismissed | "No new recommendations" message |
| TMDB API failure | Affected section shows error with retry; others unaffected |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-trending-tmdb](us-01-trending-tmdb.md) | TMDB trending with day/week toggle, deduplication, Load More | Not started | Yes |
| 02 | [us-02-recommendations](us-02-recommendations.md) | Personalised recommendations from top-rated library (10-100 source movies), scored by profile | Not started | Yes |
| 03 | [us-03-genre-spotlight](us-03-genre-spotlight.md) | Genre-specific rows from top-rated genres with variety rotation | Not started | Blocked by us-02 |
| 04 | [us-04-watchlist-recommendations](us-04-watchlist-recommendations.md) | Recommendations based on watchlist items | Not started | Yes |
| 05 | [us-05-trending-plex](us-05-trending-plex.md) | Trending on Plex Discover cloud (when connected) | Not started | Yes |
| 06 | [us-06-rewatch-suggestions](us-06-rewatch-suggestions.md) | High-rated movies from watch history, 6+ months old | Not started | Yes |
| 07 | [us-07-from-your-server](us-07-from-your-server.md) | Unwatched library movies available on Plex, scored by profile | Not started | Blocked by us-02 |
| 08 | [us-08-context-aware-picks](us-08-context-aware-picks.md) | Time/calendar-aware curated collections (Date Night, Halloween, etc.) | Not started | Yes |
| 09 | [us-09-not-interested-persistence](us-09-not-interested-persistence.md) | Backend persistence for dismissed movies, excluded from all sections | Not started | Yes |
| 10 | [us-10-discover-card-actions](us-10-discover-card-actions.md) | Card action buttons: Add, Watchlist, Watched, Request, Not Interested with badges | Not started | Yes |

US-01 through US-08 are the sections (mostly parallelisable). US-09 and US-10 are cross-cutting (card actions and dismissal persistence).

## Verification

- Each section renders its data source correctly
- Recommendations improve with more comparisons
- Genre spotlight shows variety (not just top genre)
- Not Interested persists across sessions and excludes from all sections
- "Mark as Watched" creates library entry + watch history entry
- Context-aware picks match current date/time
- Plex sections hidden when disconnected
- Empty sections are hidden, not shown as empty rows

## Out of Scope

- AI-generated insights ("Movies with strong female lead") — future enhancement, requires LLM integration
- TV show discovery (movie-only for now)
- Collaborative filtering (would need multi-user data)
- Social features (shared lists, reviews)
- IMDB trending (no public API without scraping)
