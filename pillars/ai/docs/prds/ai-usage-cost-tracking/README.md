# PRD: AI Usage & Cost Tracking

> Epic: [AI Operations App](../../epics/ai-operations-app.md)
> Status: Done

## Purpose

The AI Usage dashboard — the pillar's primary `app` page, mounted by the shell at `/ai`. It renders platform-wide AI cost, call volume, cache hit rate, error rate, per-provider/model/domain/operation breakdowns, latency percentiles, per-model quality metrics, and a usage-history chart, all filterable by date range.

The page reads the observability surface (`/ai-observability/*`); it does not query the database directly. Older summary endpoints (`/ai-usage/stats`, `/ai-usage/history`) remain on the contract as a lighter roll-up but the dashboard uses the richer observability endpoints.

## REST API Surface

Served by the `pops-ai` container; reached by the app through the shell's `/ai-api/` upstream.

| Method | Path                        | Returns                                                                                                                                    |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/ai-observability/stats`   | Totals (`totalCalls`, tokens, `totalCostUsd`, `cacheHitRate`, `errorRate`) + `byProvider`/`byModel`/`byDomain`/`byOperation` breakdowns    |
| GET    | `/ai-observability/history` | Daily records (`date`, `calls`, tokens, `costUsd`, `cacheHits`, `errors`) + summary totals                                                 |
| GET    | `/ai-observability/quality` | Per-model `cacheHitRate`, `errorRate`, `timeoutRate`, `budgetBlockRate`, `averageLatencyMs`                                                |
| GET    | `/ai-observability/latency` | `p50`/`p75`/`p95`/`p99`/`avg` plus a `slowQueries` list                                                                                    |
| GET    | `/ai-usage/stats`           | Lightweight roll-up: `totalCost`, `totalApiCalls`, `totalCacheHits`, `cacheHitRate`, `avgCostPerCall`, token totals, optional `last30Days` |
| GET    | `/ai-usage/history`         | Daily roll-up records + summary, over an optional `startDate`/`endDate` range                                                              |

All observability endpoints accept optional `provider`, `model`, `domain`, `operation`, `startDate`, `endDate` query filters applied conjunctively.

## Data Model

Reads from `ai_inference_log` (see [AI Observability](../ai-observability/README.md) for the full schema). Cost is denormalised onto each row at write time, so all aggregation is `SUM`/`COUNT`/`GROUP BY` over the log.

## Rules

- Cache hits (`cached = 1`) count toward `cacheHitRate` but contribute zero cost and are excluded from latency percentiles.
- `errorRate` counts rows with status `error`, `timeout`, or `budget-blocked` over total calls.
- History buckets by UTC date; empty windows return zeros, never errors.
- Cost is formatted as USD with appropriate precision in the UI.

## Acceptance Criteria

- [x] AI Usage page is reachable at `/ai` and registered in the app rail with a `violet` accent and the `Bot` icon.
- [x] KPI cards show total cost, total calls, cache hit rate, and error rate for the selected window.
- [x] A cost breakdown table shows provider/model/domain/operation with calls, input/output tokens, and total cost.
- [x] A latency section shows P50/P75/P95/P99 (+avg) and a slow-queries table.
- [x] A quality section shows per-model cache hit rate, error rate, timeout rate, and average latency.
- [x] A usage-history chart renders cost/calls over time with a start/end date-range filter and a clear-dates control.
- [x] Loading skeletons render while data fetches; an error alert renders on failure.
- [x] `/ai-observability/stats`, `/history`, `/quality`, `/latency` return correct totals, breakdowns, and ascending percentiles (P50 ≤ P75 ≤ P95 ≤ P99); all handle an empty table gracefully.
- [x] `/ai-usage/stats` separates cached rows (zero cost) from API calls and computes `cacheHitRate = cacheHits / (cacheHits + apiCalls)`; includes `last30Days` when data exists in that window.

## Out of Scope

- Cache maintenance UI — see the [AI Configuration & Rules](../ai-configuration-rules/README.md) PRD.
- Provider health cards, budget progress bars, and alert wiring — see [AI Observability](../ai-observability/README.md).
