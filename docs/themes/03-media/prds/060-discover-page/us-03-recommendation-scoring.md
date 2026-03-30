# US-03: Recommendation scoring service

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a developer, I want a reusable scoring service that rates movies against the user's preference profile so that multiple discover sections can share the same personalisation logic.

## Acceptance Criteria

- [ ] `scoreDiscoverResults(results, profile)` function in the discovery service
- [ ] Accepts an array of `DiscoverResult` and a `PreferenceProfile`
- [ ] Maps TMDB genre IDs to genre names via `TMDB_GENRE_MAP`
- [ ] Computes match percentage from genre affinity scores (ELO-based)
- [ ] Falls back to watch history genre distribution when no comparison data exists
- [ ] Match percentage scaled to 50-98% range
- [ ] Returns `ScoredDiscoverResult[]` with `matchPercentage` and `matchReason` (top 3 matching genres)
- [ ] Sorted by matchPercentage descending
- [ ] Reusable by: recommendations, genre spotlight, watchlist recs, from-your-server sections
- [ ] Tests cover: scoring with ELO data, fallback to watch history, empty profile returns 0%, genre mapping

## Notes

This extracts and formalises the existing `scoreRecommendations` logic from `discovery/service.ts` into a cleaner interface that multiple endpoints can call. The existing function already does most of this — this US is about ensuring it's properly reusable and tested, not a rewrite.
