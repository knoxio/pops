# PRD-014: Discovery & Recommendations

**Epic:** [05 — Discovery & Recommendations](../themes/media/epics/05-discovery-recommendations.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [008 — Pairwise ELO Ratings](../architecture/adr-008-pairwise-elo-ratings.md)

## Problem Statement

The user has watched movies, compared them across dimensions, and built a preference profile. Now the system needs to use that data to recommend what to watch next. Without recommendations, the comparison system generates data that goes nowhere — violating the "output > input" principle.

## Goal

A discovery page that surfaces personalised movie recommendations based on the user's comparison scores and watch history. A "what should I watch tonight?" quick-pick flow. Trending and "similar to" suggestions from TMDB fill in the gaps. The system improves as more comparisons accumulate.

## Requirements

### R1: Preference Profile

Derived from comparison data — not user-configured.

**Computed attributes:**
- **Genre affinity scores:** For each genre, average the ELO scores of watched movies in that genre across all dimensions. Genres with high-scoring movies = genres the user likes.
- **Dimension weights:** Which dimensions the user has compared most frequently. More comparisons on "cinematography" than "entertainment" implies cinematography matters more.
- **Watched genre distribution:** How many movies per genre. Reveals genre preferences independent of ratings.

**Computation:** Run on-demand when the discovery page loads, or cached and refreshed when new comparisons are recorded. At the expected data volume (<2,500 movies, <10,000 comparisons), computing on-demand is fast enough — no background job needed.

### R2: Candidate Sourcing from TMDB

Fetch candidates that the user might enjoy:

| Source | TMDB endpoint | Purpose |
|--------|--------------|---------|
| Similar | `GET /3/movie/{id}/similar` | Movies similar to the user's highest-rated titles |
| Popular | `GET /3/movie/popular` | Broadly popular movies as a baseline |
| Top Rated | `GET /3/movie/top_rated` | Highly-rated movies the user may have missed |
| Trending | `GET /3/trending/movie/week` | Currently trending for recency |

**Candidate selection:**
- Fetch "similar" for the top 10 highest-scored movies in the library (by overall ELO)
- Fetch 1 page each of popular, top-rated, and trending
- Deduplicate across all sources
- Filter out movies already in the library or already dismissed
- Cache candidates locally (store TMDB metadata in a `recommendation_candidates` table or in-memory cache with TTL)

**Refresh schedule:** Re-fetch candidates when the discovery page loads if the cache is >24 hours old. No background cron — the data isn't that time-sensitive.

### R3: Scoring Algorithm (v1)

Simple weighted scoring:

```
score = (genre_affinity_match × 0.5) + (tmdb_vote_average × 0.3) + (source_boost × 0.2)
```

**Components:**
- `genre_affinity_match` (0–1): How well the candidate's genres align with the user's genre affinity scores. Average of the user's affinity for each of the candidate's genres, normalised to 0–1.
- `tmdb_vote_average` (0–1): TMDB community rating normalised (vote_average / 10).
- `source_boost` (0–1): Bonus for how the candidate was sourced. "Similar to a top-rated movie" scores higher than "generic popular."

| Source | Boost |
|--------|-------|
| Similar to top-5 rated | 1.0 |
| Similar to top-10 rated | 0.7 |
| Top rated | 0.5 |
| Trending | 0.3 |
| Popular | 0.2 |

This is deliberately simple. The algorithm evolves as data accumulates (see [media ideas](../ideas/media-ideas.md) for advanced approaches).

### R4: Discovery Page (`/media/discover`)

**Layout:**

**"Recommended for You" section:**
- Top 10-20 scored candidates in a horizontal scroll row
- Each card shows: poster, title, year, genre tags, match indicator (percentage or "Strong match" / "Good match"), TMDB rating
- Brief explanation: "Because you rated [X] highly" or "Similar to [Y]"
- Actions: "Add to Library" / "Add to Watchlist" / "Not Interested"

**"Trending This Week" section:**
- Horizontal scroll row of TMDB trending movies
- Filtered to exclude already-in-library items
- Same card format, no match indicator (these aren't personalised)

**"Because You Liked [Movie]" sections:**
- 2-3 rows, one per highly-rated library movie
- Each row shows similar movies from TMDB
- Row header: "Because you liked [Movie Title]" with poster thumbnail

**Cold start state (< 5 comparisons):**
- Hide "Recommended for You" section
- Show a prompt: "Do 10+ comparisons to unlock personalised recommendations"
- Link to the comparison arena
- Still show trending and popular sections

### R5: "What Should I Watch Tonight?" Flow

Quick-pick entry point — prominent button on the media home page or discovery page.

**Behaviour:**
1. User taps "What should I watch tonight?"
2. System picks from: (a) top-scored unwatched candidate, (b) highest-priority watchlist item, (c) random highly-matched candidate
3. Display a single recommendation card: large poster, title, year, overview, genres, match indicator, TMDB rating
4. Actions: "Watch This" (adds to library if needed, marks as watching), "Show Another" (next pick), "Not Tonight" (dismiss and close)

**Optional filters (stretch):**
- "I have 90 minutes" → filter by runtime ≤ 90
- "Something light" / "Something intense" → filter by genre mood mapping (comedy/animation = light, thriller/drama = intense)

### R6: Dismissed Suggestions

Track "Not Interested" choices so dismissed items don't resurface.

**Schema addition:**
```typescript
export const dismissedSuggestions = sqliteTable('dismissed_suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tmdbId: integer('tmdb_id').notNull(),
  dismissedAt: text('dismissed_at').notNull().default(sql`(datetime('now'))`),
});
```

- "Not Interested" on any recommendation card → insert into `dismissed_suggestions`
- Candidate sourcing filters out dismissed TMDB IDs
- No undo UI in v1 — dismissed items can be un-dismissed via a future "Dismissed" management page

### R7: Recommendation Explanations

Each recommendation includes a brief explanation of why it was suggested:

| Scenario | Explanation |
|----------|-------------|
| Similar to top-rated | "Similar to [Movie Title]" |
| Genre match | "Because you enjoy [Genre]" |
| Trending | "Trending this week" |
| Popular + genre match | "Popular in [Genre]" |

Keep explanations honest and simple. Don't fabricate sophisticated reasoning — the algorithm is a weighted score, not deep analysis.

### R8: Route Addition

Add to `@pops/app-media/routes`:
```typescript
{ path: 'discover', element: <DiscoverPage /> },
```

Add "Discover" to the media app's secondary navigation — this is a high-visibility feature, position it prominently.

## Out of Scope

- TV show recommendations (comparisons are movies-only in v1)
- Collaborative filtering
- Content-based filtering on cast/crew/keywords
- Mood-based or temporal recommendations
- AI-powered recommendations
- Notification-driven suggestions
- "Year in review" or statistics

## Acceptance Criteria

1. Preference profile computed from comparison scores and watch history
2. TMDB candidates fetched (similar, popular, top-rated, trending) and cached
3. Candidates scored against preference profile
4. Discovery page shows personalised recommendations with explanations
5. "Trending This Week" section shows current TMDB trending
6. "Because You Liked [X]" sections show similar movies
7. Cold start state shown when < 5 comparisons, with arena CTA
8. "What should I watch tonight?" returns a single recommendation
9. "Not Interested" dismisses a suggestion and prevents it from resurfacing
10. All recommendation cards have "Add to Library" and "Add to Watchlist" actions
11. Match indicator (percentage or label) shown on personalised recommendations
12. Candidates filtered to exclude already-in-library and dismissed items
13. Page responsive at 375px, 768px, 1024px
14. `mise db:seed` updated with dismissed suggestions data
15. Unit tests for scoring algorithm
16. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes.

### Batch A — Backend (parallelisable)

#### US-1: Preference profile computation
**Scope:** Create `modules/media/recommendations/profile.ts`. Compute genre affinity scores (average ELO of watched movies per genre). Compute dimension weights (comparison frequency per dimension). Pure functions, unit tests.
**Files:** `modules/media/recommendations/profile.ts`, test

#### US-2a: Candidate sourcing from TMDB
**Scope:** Create `modules/media/recommendations/candidates.ts`. Fetch TMDB "similar" for top 10 library movies, "popular", "top rated", "trending". Deduplicate. Filter out library items and dismissed. Cache locally (in-memory with 24h TTL or DB table).
**Files:** `modules/media/recommendations/candidates.ts`

#### US-2b: Scoring algorithm
**Scope:** Create `modules/media/recommendations/scoring.ts`. Score = `genre_affinity_match × 0.5 + tmdb_vote_average × 0.3 + source_boost × 0.2`. Source boosts per R3. Pure function, unit tests.
**Files:** `modules/media/recommendations/scoring.ts`, test

#### US-5: Dismissed suggestions
**Scope:** Create `src/db/schema/dismissed.ts` Drizzle schema (`dismissed_suggestions` table). Add tRPC procedures: `media.recommendations.dismiss({ tmdbId })`, `media.recommendations.listDismissed`. Filter dismissed from candidate sourcing. Unit tests.
**Files:** `src/db/schema/dismissed.ts`, `modules/media/recommendations/router.ts`, test

### Batch B — Frontend (parallelisable, depends on Batch A)

#### US-3a: Discovery page — Recommended for You
**Scope:** Create `DiscoverPage.tsx`. "Recommended for You" section: horizontal scroll row of top 10-20 scored candidates. Each card: poster, title, year, genres, match indicator (percentage or "Strong match"), brief explanation ("Because you rated [X] highly"). "Add to Library" / "Add to Watchlist" / "Not Interested" actions. Cold start state (<5 comparisons): hide section, show arena CTA. Add route + "Discover" to secondary nav.
**Files:** `packages/app-media/src/pages/DiscoverPage.tsx`

#### US-3b: Discovery page — Trending and Similar sections
**Scope:** Add "Trending This Week" horizontal scroll row (TMDB trending, exclude library items). Add 2-3 "Because You Liked [Movie]" rows (similar movies for top-rated library items, each with row header showing the source movie). Same card format as Recommended section.
**Files:** `DiscoverPage.tsx` (extend)

#### US-4: "What should I watch tonight?" flow
**Scope:** Create quick-pick component/modal. Prominent button on media home or discover page. Shows single recommendation card (large poster, title, year, overview, genres, match, TMDB rating). Actions: "Watch This" (add to library if needed), "Show Another" (next pick from candidates + watchlist), "Not Tonight" (dismiss and close).
**Files:** New component
