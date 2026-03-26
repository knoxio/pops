# US-02: Tracking and comparison schema

> PRD: [028 — Media Data Model & API](README.md)
> Status: To Review

## Description

As a developer, I want the media_watchlist, watch_history, comparison_dimensions, comparisons, and media_scores tables so that tracking, watchlist, and pairwise rating data can be stored.

## Acceptance Criteria

- [ ] `media_watchlist` table created (id, mediaType, mediaId, priority, notes, addedAt)
- [ ] `media_watchlist` unique index on (mediaType + mediaId)
- [ ] `media_watchlist.mediaType` constrained to "movie" or "tv_show"
- [ ] `media_watchlist.priority` defaults to 0
- [ ] `watch_history` table created (id, mediaType, mediaId, watchedAt, completed)
- [ ] `watch_history` indexes on: (mediaType + mediaId), watchedAt, (mediaType + mediaId + watchedAt) UNIQUE
- [ ] `watch_history.mediaType` constrained to "movie" or "episode"
- [ ] `watch_history.completed` defaults to 0
- [ ] `comparison_dimensions` table created (id, name, description, active, sortOrder, createdAt)
- [ ] `comparison_dimensions.name` has UNIQUE constraint
- [ ] `comparison_dimensions.active` defaults to 1
- [ ] `comparisons` table created (id, dimensionId, mediaAType, mediaAId, mediaBType, mediaBId, winnerType, winnerId, comparedAt)
- [ ] `comparisons` FK from dimensionId to comparison_dimensions(id)
- [ ] `comparisons` indexes on: dimensionId, (mediaAType + mediaAId), (mediaBType + mediaBId)
- [ ] `media_scores` table created (id, mediaType, mediaId, dimensionId, score, comparisonCount, updatedAt)
- [ ] `media_scores` unique index on (mediaType + mediaId + dimensionId)
- [ ] `media_scores` FK from dimensionId to comparison_dimensions(id)
- [ ] `media_scores.score` defaults to 1500.0
- [ ] `media_scores.comparisonCount` defaults to 0
- [ ] Tests verify table creation, unique constraints, default values, and FK enforcement

## Notes

Watchlist and watch history use polymorphic references (mediaType + mediaId) without database-level FKs — application-layer validation ensures referential integrity. The watchlist tracks movies and TV shows; watch history tracks movies and individual episodes. Comparison and scoring tables support the pairwise Elo system per [ADR-010](../../../../architecture/adr-010-pairwise-elo-ratings.md).
