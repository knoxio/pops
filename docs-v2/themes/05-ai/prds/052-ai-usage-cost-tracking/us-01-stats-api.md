# US-01: Usage stats API

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: Partial

## Description

As a developer, I want API procedures for AI usage statistics so that the usage page can display costs and trends.

## Acceptance Criteria

- [x] `core.aiUsage.getStats` returns: totalCost (excluding cache hits), totalApiCalls, totalCacheHits, cacheHitRate (0-1), avgCostPerCall, totalInputTokens, totalOutputTokens
- [x] Includes `last30Days` sub-summary if data exists in that window
- [x] `core.aiUsage.getHistory` returns daily aggregation with optional date range filter
- [x] History ordered by date DESC
- [x] Both handle empty table gracefully (zeros, not errors)
- [ ] Tests cover: empty data, single entry, date range filtering — no test file exists for ai-usage module

## Notes

Stats separate cached (cached=1, zero cost) from API calls (cached=0, real cost). Cache hit rate = cacheHits / (cacheHits + apiCalls).

**Audit findings** (`apps/pops-api/src/modules/core/ai-usage/`): `getStats` and `getHistory` tRPC procedures exist with all required output fields. No test file — `apps/pops-api/src/modules/core/ai-usage/*.test.ts` does not exist.
