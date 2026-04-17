# US-05: Stats & Metrics API

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a frontend dashboard, I need a comprehensive set of API endpoints that return aggregated AI usage statistics, latency percentiles, and quality metrics so that the monitoring dashboard (US-06) can render cost breakdowns, performance charts, and quality indicators without performing heavy aggregation client-side.

## Acceptance Criteria

- [ ] `core.aiObservability.getStats` endpoint: returns summary statistics including `totalCalls`, `totalInputTokens`, `totalOutputTokens`, `totalCostUsd`, `cacheHitRate` (cached calls / total calls), `errorRate` (error + timeout calls / total calls), and breakdowns by `provider`, `model`, `domain`, and `operation` — each breakdown item includes call count, token totals, and cost total. Replaces the existing `core.aiUsage.getStats` endpoint.
- [ ] `core.aiObservability.getHistory` endpoint: returns daily aggregated rows with columns `date`, `calls`, `inputTokens`, `outputTokens`, `costUsd`, `cacheHits`, `errors`. Supports filters: `provider`, `model`, `domain`, `operation`, `startDate`, `endDate`. Replaces the existing `core.aiUsage.getHistory` endpoint.
- [ ] `core.aiObservability.getLatencyStats` endpoint: computes P50, P75, P95, P99 percentiles from `ai_inference_log` rows where `latency_ms > 0` and `status = 'success'`. Supports filters: `provider`, `model`, `operation`, `startDate`, `endDate`. Also returns a `slowQueries` list: up to 20 most recent calls where `latency_ms > 2 * P95` for their respective model, including `id`, `model`, `operation`, `latency_ms`, `created_at`, and `context_id`.
- [ ] `core.aiObservability.getQualityMetrics` endpoint: returns per-model metrics including `cacheHitRate`, `errorRate`, `timeoutRate`, `budgetBlockRate`, and `averageLatencyMs`. Supports the same filter set as other endpoints.
- [ ] All endpoints accept optional filters: `provider` (string), `model` (string), `domain` (string), `operation` (string), `startDate` (ISO date string), `endDate` (ISO date string). Filters are applied conjunctively (AND).
- [ ] A BullMQ repeatable job (`ai-observability-summary`) runs daily at 03:00 UTC: computes 30-day rolling summaries (total cost, total calls, cost by provider, cost by model, cache hit rate, error rate, average latency by model) and stores them in a settings key (`ai.observabilitySummary`). The dashboard can read this key for instant first-paint without waiting for heavy queries.
- [ ] Percentile computation uses application-level calculation from sorted results (SQLite has no built-in percentile function): query `latency_ms` values with `ORDER BY latency_ms ASC`, then compute P50/P75/P95/P99 by index position (e.g., P95 = value at index `FLOOR(0.95 * count)`)
- [ ] Backwards compatibility: the existing `core.aiUsage.getStats` and `core.aiUsage.getHistory` endpoints either still work (proxying to the new implementation) or are removed with the frontend simultaneously migrated to the new endpoints in US-06
- [ ] Unit test: insert 100 inference log rows with varying providers, models, operations, latencies, and statuses. Verify `getStats` returns correct totals and breakdowns. Verify `getLatencyStats` returns percentiles in ascending order (P50 <= P75 <= P95 <= P99). Verify `getHistory` returns one row per day within the queried range.

## Notes

- Percentile queries can be expensive on large tables. The daily summary job (03:00 UTC) pre-computes the most common dashboard view (last 30 days) so the dashboard loads instantly. The live endpoints are used when the user changes filters or date ranges.
- The `slowQueries` threshold (2x P95) is computed per-model so that a fast model (Haiku) and a slow model (Opus) each have appropriate thresholds.
- The summary settings key (`ai.observabilitySummary`) should store a JSON object with a `computedAt` timestamp so the dashboard can show "last updated X ago".
- When the `ai_inference_daily` aggregate table exists (US-08), history queries for dates older than the retention window should read from that table and union with live data.
