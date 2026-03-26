# US-01: Usage stats API

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: To Review

## Description

As a developer, I want API procedures for AI usage statistics so that the usage page can display costs and trends.

## Acceptance Criteria

- [ ] `core.aiUsage.getStats` returns: totalCost (excluding cache hits), totalApiCalls, totalCacheHits, cacheHitRate (0-1), avgCostPerCall, totalInputTokens, totalOutputTokens
- [ ] Includes `last30Days` sub-summary if data exists in that window
- [ ] `core.aiUsage.getHistory` returns daily aggregation with optional date range filter
- [ ] History ordered by date DESC
- [ ] Both handle empty table gracefully (zeros, not errors)
- [ ] Tests cover: empty data, single entry, date range filtering

## Notes

Stats separate cached (cached=1, zero cost) from API calls (cached=0, real cost). Cache hit rate = cacheHits / (cacheHits + apiCalls).
