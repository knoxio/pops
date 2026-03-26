# US-02: Personalised recommendations

> PRD: [038 — Discovery & Recommendations](README.md)
> Status: Partial

## Description

As a user, I want personalised movie recommendations based on my comparison data so that I can discover movies I'm likely to enjoy.

## Acceptance Criteria

- [x] "Recommended for You" section renders below Trending on the `/media/discover` page
- [ ] Section is hidden entirely when the user has fewer than 5 recorded comparisons — no comparison-count check; section always renders
- [ ] When hidden, a CTA card displays: "Compare more movies to unlock recommendations" linking to `/media/compare` — shows "Add movies to library" message instead
- [x] Recommendations display as poster cards with title, year, and a composite score badge
- [x] Each recommendation includes a "Because you liked {Movie}" attribution label identifying the source movie
- [x] Composite score is calculated as: `(genre_affinity * 0.5) + (tmdb_vote_average / 10 * 0.3) + (source_boost * 0.2)`
- [x] Movies already in the user's library are excluded from recommendations
- [x] Duplicate recommendations (same movie from multiple sources) are deduplicated — keep the highest score
- [x] Recommendations are sorted by composite score descending
- [x] "Add to Library" button on each recommendation card
- [ ] If all similar movies are already in the library, display "No new recommendations — keep comparing" — shows generic fallback message instead
- [x] Page calls `media.discovery.recommendations` with optional sample size parameter
- [x] Loading state: skeleton cards while recommendations compute
- [ ] Tests cover: recommendations render with attribution, cold start CTA shown under threshold, movies in library excluded, deduplication, composite score sorting, add to library action, "no new recommendations" state — no frontend component tests (backend unit tests exist)

## Notes

The recommendation procedure is computed on demand — no pre-calculation or background jobs. Source movie selection uses the top-rated movies from the user's library (highest overall Elo). For each source, TMDB's "similar movies" endpoint provides candidates. The sample size parameter controls how many source movies to use (default: top 5 by Elo score). More source movies = broader recommendations but slower response.
