# Epic: Discovery & Recommendations

**Theme:** Media
**Priority:** 5 (depends on comparisons data)
**Status:** Done

## Goal

Build the recommendation engine that turns watch history and comparison scores into personalised suggestions. This is where the app delivers on "output > input" — the user does quick 1v1 comparisons, and the system tells them what to watch next.

## How it works

1. **Build a preference profile** from comparison scores — which dimensions matter most to the user, which genres score highest, what patterns emerge
2. **Score unwatched candidates** from TMDB (popular, trending, similar-to-watched) against the preference profile
3. **Surface ranked suggestions** in a discovery feed — "based on your taste, you'd probably enjoy these"

The algorithm starts simple (weighted genre affinity) and evolves as data accumulates.

## Scope

### In scope

- **Preference profile derivation:**
  - Genre affinity scores — computed from the genres of high-scoring titles in the comparison system
  - Dimension weights — which dimensions the user has compared most on (implicit signal of what they care about)
  - Watched genre distribution — what genres the user gravitates toward
- **Candidate sourcing from TMDB:**
    - Fetch TMDB "similar" movies for highly-rated library items
  - Fetch TMDB "popular" and "top rated" movies as baseline candidates
  - Fetch TMDB "trending" movies (daily/weekly) for recency
  - Fetch TheTVDB recommendations/similar for TV shows
  - Cache candidate metadata locally to avoid redundant API calls
- **Scoring algorithm (v1 — simple weighted):**
  - Score = genre_affinity_match × community_vote_average × dimension_profile_similarity
  - Filter out already-watched and already-in-library items
  - Rank by score, return top N
- **Discovery page** (`/media/discover`):
  - "Recommended for you" — top scored suggestions with explanation ("Because you rated [X] highly for cinematography, and this shares [genres]")
  - "Trending" — TMDB trending, filtered to exclude watched/library items
  - "Similar to [title]" — TMDB similar results for a selected library item
  - Each suggestion shows poster, title, year, genre tags, community rating, and a match percentage or affinity indicator
  - "Add to watchlist" and "Add to library" actions on each suggestion
  - "Not interested" dismissal (hides from future suggestions)
- **"What should I watch tonight?" flow:**
  - Quick entry point (home screen widget or prominent button)
  - Combines watchlist items + fresh recommendations
  - Optional mood/time filter ("I have 90 minutes", "something light")
- **Dismissed suggestions tracking** — persist "not interested" choices so dismissed items don't resurface

### Out of scope

- Collaborative filtering (requires community data we don't have)
- Content-based filtering on cast/crew/keywords (future enhancement)
- Mood-based or temporal pattern matching (future enhancement)
- AI-powered recommendation (Haiku-based — future enhancement)
- Notification-driven suggestions ("you haven't watched anything in a week")

## Deliverables

1. Preference profile computation from comparison scores and watch history
2. Candidate sourcing from TMDB (movies) and TheTVDB (TV) with local caching
3. Scoring algorithm that ranks candidates against the preference profile
4. Discovery page with recommendation feed, trending, and similar-to sections
5. Match percentage or affinity indicator on each suggestion
6. Brief explanation for each recommendation ("because you liked X")
7. "What should I watch tonight?" quick-pick flow
8. "Not interested" dismissal with persistence
9. tRPC procedures for fetching recommendations, dismissing suggestions
10. Unit tests for scoring algorithm
11. Storybook stories for recommendation cards, discovery feed layout
12. `mise db:seed` updated with dismissed suggestions, ensuring the discovery page has a realistic mix of recommended/dismissed state

## Dependencies

- Epic 1 (Metadata Integration) — candidate sourcing and metadata
- Epic 4 (Ratings & Comparisons) — comparison scores drive the preference profile
- Enough comparison data to produce meaningful recommendations (cold start handled by falling back to community ratings and genre preferences)

## Risks

- **Cold start** — With zero comparisons, recommendations are just "popular on TMDB" with no personalisation. Mitigation: that's fine as a starting point. As comparisons accumulate, recommendations get more personal. Be transparent: "You've done 5 comparisons. Do more to improve suggestions."
- **Stale recommendations** — If the candidate pool isn't refreshed, the same suggestions appear every time. Mitigation: re-fetch trending/popular periodically (daily cron or on-demand). Mix fresh candidates with stable recommendations.
- **Explanation quality** — "Because you liked X" is only useful if the connection is obvious. Mitigation: keep explanations simple and honest. Genre overlap and dimension affinity are explainable. Don't fabricate sophisticated reasoning.
- **API rate limits on candidate sourcing** — Fetching "similar" for every highly-rated item in the library could be expensive. Mitigation: cache aggressively, refresh on a schedule (not on every page load), limit to top N library items.
