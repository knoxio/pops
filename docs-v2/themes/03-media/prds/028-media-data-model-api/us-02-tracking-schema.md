# US-02: Tracking and comparison schema

> PRD: [028 — Media Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want the media_watchlist, watch_history, comparison_dimensions, comparisons, and media_scores tables so that tracking, watchlist, and pairwise rating data can be stored.

## Acceptance Criteria

- [x] `media_watchlist` table created (id, mediaType, mediaId, priority, notes, addedAt)
- [x] `media_watchlist` unique index on (mediaType + mediaId)
- [x] `media_watchlist.mediaType` constrained to "movie" or "tv_show"
- [x] `media_watchlist.priority` defaults to 0
- [x] `watch_history` table created (id, mediaType, mediaId, watchedAt, completed)
- [x] `watch_history` indexes on: (mediaType + mediaId), watchedAt, (mediaType + mediaId + watchedAt) UNIQUE
- [x] `watch_history.mediaType` constrained to "movie" or "episode"
- [x] `watch_history.completed` defaults to 0
- [x] `comparison_dimensions` table created (id, name, description, active, sortOrder, createdAt)
- [x] `comparison_dimensions.name` has UNIQUE constraint
- [x] `comparison_dimensions.active` defaults to 1
- [x] `comparisons` table created (id, dimensionId, mediaAType, mediaAId, mediaBType, mediaBId, winnerType, winnerId, comparedAt)
- [x] `comparisons` FK from dimensionId to comparison_dimensions(id)
- [x] `comparisons` indexes on: dimensionId, (mediaAType + mediaAId), (mediaBType + mediaBId)
- [x] `media_scores` table created (id, mediaType, mediaId, dimensionId, score, comparisonCount, updatedAt)
- [x] `media_scores` unique index on (mediaType + mediaId + dimensionId)
- [x] `media_scores` FK from dimensionId to comparison_dimensions(id)
- [x] `media_scores.score` defaults to 1500.0
- [x] `media_scores.comparisonCount` defaults to 0
- [x] Tests verify table creation, unique constraints, default values, and FK enforcement

## Notes

Watchlist and watch history use polymorphic references (mediaType + mediaId) without database-level FKs — application-layer validation ensures referential integrity. The watchlist tracks movies and TV shows; watch history tracks movies and individual episodes. Comparison and scoring tables support the pairwise Elo system per [ADR-010](../../../../architecture/adr-010-pairwise-elo-ratings.md).
