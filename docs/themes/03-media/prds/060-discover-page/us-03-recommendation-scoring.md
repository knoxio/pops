# US-03: Recommendation scoring service

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a developer, I want a reusable scoring service that rates movies against the user's preference profile so that multiple discover sections can share the same personalisation logic.

## Acceptance Criteria

- [x] `scoreDiscoverResults(results, profile)` function in the discovery service
- [x] Accepts an array of `DiscoverResult` and a `PreferenceProfile`
- [x] Maps TMDB genre IDs to genre names via `TMDB_GENRE_MAP`
- [x] Computes match percentage from genre affinity scores (ELO-based)
- [x] Falls back to watch history genre distribution when no comparison data exists
- [x] Match percentage scaled to 50-98% range
- [x] Returns `ScoredDiscoverResult[]` with `matchPercentage` and `matchReason` (top 3 matching genres)
- [x] Sorted by matchPercentage descending
- [x] Reusable by: recommendations, genre spotlight, watchlist recs, from-your-server sections
- [x] Tests cover: scoring with ELO data, fallback to watch history, empty profile returns 0%, genre mapping

## Notes

This extracts and formalises the existing `scoreRecommendations` logic from `discovery/service.ts` into a cleaner interface that multiple endpoints can call. The existing function already does most of this — this US is about ensuring it's properly reusable and tested, not a rewrite.
