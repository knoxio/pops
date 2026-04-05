# PRD-052: AI Usage & Cost Tracking

> Epic: [00 — AI Operations App](../../epics/00-ai-operations-app.md)
> Status: Done

## Overview

Build the AI usage tracking page in `@pops/app-ai`. Displays token counts, costs per domain, cache hit rates, and cost trends. Platform-level visibility into all AI capabilities across all domains.

## Data Model

Uses the existing `ai_usage` table (created in PRD-009):

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | PK, auto-increment |
| description | TEXT | Transaction description sent to API |
| entity_name | TEXT | AI result |
| category | TEXT | Category suggestion |
| input_tokens | INTEGER | Prompt token count |
| output_tokens | INTEGER | Response token count |
| cost_usd | REAL | Computed cost |
| cached | INTEGER | 0 = API call, 1 = cache hit |
| import_batch_id | TEXT | Groups requests by import session |
| created_at | TEXT | ISO 8601 |

## API Surface

| Procedure | Input | Output |
|-----------|-------|--------|
| `core.aiUsage.getStats` | (none) | totalCost, totalApiCalls, totalCacheHits, cacheHitRate, avgCostPerCall, totalInputTokens, totalOutputTokens, last30Days summary |
| `core.aiUsage.getHistory` | startDate?, endDate? | Daily aggregation: date, apiCalls, cacheHits, inputTokens, outputTokens, cost. Plus summary totals |

## UI: AI Usage Page

- Stats cards: total cost (all-time), API calls, cache hits, cache hit rate, avg cost per call
- Last 30 days summary (if data exists)
- Daily history chart (cost over time)
- Date range filter
- Per-batch breakdown (group by import_batch_id)

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-stats-api](us-01-stats-api.md) | getStats and getHistory procedures with aggregation | Done | No (first) |
| 02 | [us-02-usage-page](us-02-usage-page.md) | Stats cards, daily chart, date range filter | Done | Blocked by us-01 |
| 03 | [us-03-app-scaffold](us-03-app-scaffold.md) | `@pops/app-ai` workspace package, shell registration, route at /ai | Done | Yes (parallel with us-01) |

## Out of Scope

- AI configuration and rules management (PRD-053)
- Per-domain cost breakdown (future — needs domain tagging on ai_usage rows)
