# PRD-038: Discovery & Recommendations

> Epic: [05 — Discovery & Recommendations](../../epics/05-discovery-recommendations.md)
> Status: To Review

## Overview

Build a recommendation engine and discovery page. Surface trending content from TMDB and personalised suggestions based on comparison data and genre preferences. Display a preference profile showing the user's genre affinities and dimension weights.

## Routes

| Route | Page |
|-------|------|
| `/media/discover` | Discovery Page |

## UI Components

### Discovery Page Sections

| Section | Content |
|---------|---------|
| Trending | TMDB trending movies with day/week toggle |
| Recommended for You | Personalised suggestions (hidden if <5 comparisons) |
| Preference Profile | Genre affinities and dimension weight visualisation |

### Trending Section

| Element | Detail |
|---------|--------|
| Movie cards | Poster grid of trending TMDB movies |
| Time window toggle | "Today" / "This Week" buttons |
| Add to library action | Button on each card to add the movie to the POPS library |
| Pagination | Load more / infinite scroll for additional results |

### Recommended for You Section

| Element | Detail |
|---------|--------|
| Movie cards | Poster grid with composite score badge |
| Source indicator | "Because you liked {Movie}" label per recommendation |
| Cold start fallback | "Compare more movies to unlock recommendations" with CTA to `/media/compare` |
| Minimum threshold | Hidden entirely when fewer than 5 comparisons exist |

### Preference Profile Section

| Element | Detail |
|---------|--------|
| Genre distribution | Bar chart or tag cloud of genres by library count |
| Genre affinity scores | Ranked list of genres weighted by comparison Elo scores |
| Dimension weights | Relative weight of each dimension from comparison patterns |
| Visual style | Charts or data visualisation — not a plain table |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.discovery.trending` | Fetch TMDB trending movies (day or week time window, paginated) |
| `media.discovery.recommendations` | Fetch personalised recommendations with source movie attribution |
| `media.discovery.profile` | Fetch computed preference profile (genre affinities, dimension weights) |

## Recommendation Algorithm

### Source Selection

Fetch the top-rated movies from the user's library (highest overall Elo scores). For each source movie, query TMDB's "similar movies" endpoint.

### Composite Scoring

```
score = (genre_affinity * 0.5) + (tmdb_vote_average_normalised * 0.3) + (source_boost * 0.2)
```

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Genre affinity | 0.5 | Average genre affinity score of the movie's genres (from preference profile) |
| TMDB vote average | 0.3 | Normalised to 0-1 range: `vote_average / 10` |
| Source boost | 0.2 | Normalised Elo score of the source movie that surfaced this recommendation |

### Filtering

- Exclude movies already in the user's library
- Deduplicate (same movie recommended from multiple sources — keep highest score)
- Sort by composite score descending

## Preference Profile

### Genre Distribution

Count of movies per genre in the user's library. Displayed as a bar chart or weighted tag cloud.

### Genre Affinity

Weight each movie's genres by its overall Elo score. High-rated movies contribute more to genre affinity than low-rated ones.

```
genre_affinity[genre] = average(elo_score) for all movies with that genre
```

### Dimension Weights

Based on comparison patterns — dimensions with more comparisons and wider score variance carry more weight in the user's preference profile.

## Cold Start Handling

| Condition | Behaviour |
|-----------|-----------|
| <5 comparisons | Hide "Recommended for You" section, show CTA to compare arena |
| No library items | Hide "Recommended for You" and "Preference Profile", show only Trending |
| Trending API failure | Show error message with retry button, other sections unaffected |

## Business Rules

- Trending data is fetched live from TMDB — not cached locally (TMDB handles rate limiting)
- Recommendations are computed on demand, not pre-calculated
- Preference profile updates automatically as comparisons are added
- "Add to library" from trending/recommendations creates the movie record via TMDB metadata
- Recommendations require a minimum of 5 comparisons to generate meaningful results
- Each recommendation includes attribution ("Because you liked X") for transparency

## Edge Cases

| Case | Behaviour |
|------|-----------|
| TMDB API unavailable | Trending section shows error with retry; recommendations fall back to library-only scoring if possible |
| User has only 1 genre in library | Genre distribution shows single genre; recommendations may be narrow |
| All similar movies already in library | "No new recommendations — keep comparing" message |
| Movie from trending already in library | "In Library" badge replaces "Add to Library" button |
| Preference profile with no comparisons | Hidden entirely (cold start) |
| Very new user (empty library) | Only Trending section visible |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-trending](us-01-trending.md) | Trending section with TMDB trending movies, day/week toggle, add-to-library action | Yes |
| 02 | [us-02-recommendations](us-02-recommendations.md) | Personalised recommendations based on preference profile, cold start handling with arena CTA | Yes |
| 03 | [us-03-preference-profile](us-03-preference-profile.md) | Visual preference profile display (genre affinities, dimension weights) | Yes |

All three stories can be built in parallel — they are independent sections of the discovery page.

## Verification

- Trending section shows TMDB trending movies with day/week toggle
- Add to library action creates a movie record from trending data
- "In Library" badge appears for movies already in the library
- Recommendations appear after 5+ comparisons with source attribution
- Cold start hides recommendations and shows arena CTA
- Preference profile shows genre distribution and dimension weights
- Empty library shows only trending section
- TMDB API errors are handled gracefully

## Out of Scope

- Content-based or collaborative filtering algorithms
- Mood-based suggestions
- Temporal pattern analysis (e.g., "you watch comedies on weekends")
- TV show recommendations (movie-only for now)
- Caching TMDB trending data locally
