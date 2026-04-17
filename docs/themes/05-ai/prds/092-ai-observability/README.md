# PRD-092: AI Observability Platform

> Epic: [03 — AI Observability](../../epics/03-ai-observability.md)
> Status: Not started

## Overview

Build a multi-provider observability layer that tracks every AI inference call across POPS — cloud APIs (Claude Haiku, Sonnet, Opus), local models (Ollama, llama.cpp), and Cerebrum operations (embeddings, Ego conversations, Glia curation). Extends the existing `ai_usage` table with provider/model metadata, latency tracking, domain tagging, and operation classification. Adds budget enforcement (the monthly budget setting exists but is never checked), a provider registry for managing cloud and local model configurations, and a monitoring dashboard with alerting.

## Data Model

### ai_inference_log (replaces ai_usage)

| Column        | Type    | Constraints                | Description                                                                                  |
| ------------- | ------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| id            | INTEGER | PK, auto-increment         | Row ID                                                                                       |
| provider      | TEXT    | NOT NULL                   | `claude`, `ollama`, `llama-cpp`, or future provider identifier                               |
| model         | TEXT    | NOT NULL                   | Model identifier: `claude-haiku-4-5-20251001`, `llama3:8b`, etc.                             |
| operation     | TEXT    | NOT NULL                   | `entity-match`, `rule-generation`, `embedding`, `conversation`, `curation`, `classification` |
| domain        | TEXT    |                            | `finance`, `media`, `inventory`, `cerebrum`, or null for cross-domain                        |
| input_tokens  | INTEGER | NOT NULL                   | Input token count                                                                            |
| output_tokens | INTEGER | NOT NULL                   | Output token count (0 for embeddings)                                                        |
| cost_usd      | REAL    | NOT NULL                   | Computed cost — 0 for local models                                                           |
| latency_ms    | INTEGER | NOT NULL                   | End-to-end call duration in milliseconds                                                     |
| status        | TEXT    | NOT NULL DEFAULT 'success' | `success`, `error`, `timeout`, `budget-blocked`                                              |
| cached        | INTEGER | NOT NULL DEFAULT 0         | 1 if served from cache (no inference call made)                                              |
| context_id    | TEXT    |                            | Grouping key — conversation ID, import batch ID, job ID                                      |
| error_message | TEXT    |                            | Error detail when status != success                                                          |
| metadata      | TEXT    |                            | JSON — provider-specific data (temperature, top_p, stop reason, chunk index)                 |
| created_at    | TEXT    | NOT NULL                   | ISO 8601                                                                                     |

**Indexes:** `created_at`, `provider + model`, `operation`, `domain`, `context_id`, `status`

**Migration:** The existing `ai_usage` table is migrated to `ai_inference_log`. Old rows are backfilled with `provider: 'claude'`, `model: 'claude-haiku-4-5-20251001'`, `operation: 'entity-match'`, `domain: 'finance'`, `latency_ms: 0` (unknown), `status: 'success'`.

### ai_providers (SQLite)

| Column            | Type    | Constraints               | Description                                                                  |
| ----------------- | ------- | ------------------------- | ---------------------------------------------------------------------------- |
| id                | TEXT    | PK                        | Provider ID: `claude`, `ollama`, `llama-cpp`                                 |
| name              | TEXT    | NOT NULL                  | Display name                                                                 |
| type              | TEXT    | NOT NULL                  | `cloud` or `local`                                                           |
| base_url          | TEXT    |                           | API endpoint — null for Claude (uses SDK default), required for local models |
| api_key_ref       | TEXT    |                           | Settings key storing the actual API key (e.g., `anthropic.apiKey`)           |
| status            | TEXT    | NOT NULL DEFAULT 'active' | `active`, `error`                                                            |
| last_health_check | TEXT    |                           | ISO 8601 — last health check timestamp                                       |
| last_latency_ms   | INTEGER |                           | Latency from last health check                                               |
| created_at        | TEXT    | NOT NULL                  | ISO 8601                                                                     |
| updated_at        | TEXT    | NOT NULL                  | ISO 8601                                                                     |

### ai_model_pricing (SQLite)

| Column               | Type    | Constraints                    | Description                                        |
| -------------------- | ------- | ------------------------------ | -------------------------------------------------- |
| id                   | INTEGER | PK, auto-increment             | Row ID                                             |
| provider_id          | TEXT    | FK → ai_providers.id, NOT NULL | Parent provider                                    |
| model_id             | TEXT    | NOT NULL                       | Model identifier                                   |
| display_name         | TEXT    |                                | Human-readable model name                          |
| input_cost_per_mtok  | REAL    | NOT NULL DEFAULT 0             | USD per million input tokens                       |
| output_cost_per_mtok | REAL    | NOT NULL DEFAULT 0             | USD per million output tokens                      |
| context_window       | INTEGER |                                | Max context size in tokens                         |
| is_default           | INTEGER | NOT NULL DEFAULT 0             | Whether this is the default model for its provider |
| created_at           | TEXT    | NOT NULL                       | ISO 8601                                           |
| updated_at           | TEXT    | NOT NULL                       | ISO 8601                                           |

**Unique constraint** on `(provider_id, model_id)`

### ai_budgets (SQLite)

| Column              | Type    | Constraints             | Description                                                                |
| ------------------- | ------- | ----------------------- | -------------------------------------------------------------------------- |
| id                  | TEXT    | PK                      | Budget scope: `global`, `provider:{id}`, `operation:{type}`                |
| scope_type          | TEXT    | NOT NULL                | `global`, `provider`, `operation`                                          |
| scope_value         | TEXT    |                         | Provider ID or operation name — null for global scope                      |
| monthly_token_limit | INTEGER |                         | Token cap per calendar month — null means unlimited                        |
| monthly_cost_limit  | REAL    |                         | USD spending cap per calendar month — null means unlimited                 |
| action              | TEXT    | NOT NULL DEFAULT 'warn' | `block` (reject calls), `warn` (log + allow), `fallback` (try local model) |
| created_at          | TEXT    | NOT NULL                | ISO 8601                                                                   |
| updated_at          | TEXT    | NOT NULL                | ISO 8601                                                                   |

## API Surface

| Procedure                                | Input                                                           | Output                                                    | Notes                                       |
| ---------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| `core.aiObservability.getStats`          | period?: 'day' \| 'week' \| 'month', provider?, model?, domain? | `{ summary, byProvider, byModel, byDomain, byOperation }` | Replaces existing `core.aiUsage.getStats`   |
| `core.aiObservability.getHistory`        | startDate?, endDate?, groupBy?, provider?, model?, domain?      | `{ entries: DailyAggregate[], summary }`                  | Replaces existing `core.aiUsage.getHistory` |
| `core.aiObservability.getLatencyStats`   | period?, provider?, model?, operation?                          | `{ p50, p75, p95, p99, avg, slowQueries[] }`              | Percentile latency breakdowns               |
| `core.aiObservability.getQualityMetrics` | period?, domain?                                                | `{ cacheHitRate, errorRate, budgetBlockRate, byModel }`   | Quality and reliability metrics             |
| `core.aiObservability.getBudgetStatus`   | —                                                               | `{ budgets: BudgetStatus[], projectedExhaustion? }`       | Current spend vs limits with projection     |
| `core.aiProviders.list`                  | —                                                               | `{ providers: Provider[] }`                               | All registered providers with status        |
| `core.aiProviders.get`                   | providerId                                                      | `{ provider: Provider, models: Model[] }`                 | Provider detail with available models       |
| `core.aiProviders.upsert`                | id, name, type, baseUrl?, config?                               | `{ provider: Provider }`                                  | Register or update a provider               |
| `core.aiProviders.healthCheck`           | providerId                                                      | `{ status, latency, error? }`                             | Test provider connectivity                  |
| `core.aiBudgets.list`                    | —                                                               | `{ budgets: Budget[] }`                                   | All budget rules                            |
| `core.aiBudgets.upsert`                  | id, monthlyTokenLimit?, monthlyCostLimit?, action?              | `{ budget: Budget }`                                      | Create or update a budget rule              |
| `core.aiAlerts.list`                     | acknowledged?                                                   | `{ alerts: Alert[] }`                                     | Active and historical alerts                |
| `core.aiAlerts.acknowledge`              | alertId                                                         | `{ success: boolean }`                                    | Mark alert as seen                          |

## Business Rules

- Every AI inference call — cloud API, local model, cache hit — is logged to `ai_inference_log` with provider, model, operation, domain, latency, and token counts
- The inference middleware wraps all AI calls transparently — callers (entity matching, rule generation, Ego, Glia, embedding pipeline) do not log manually
- Cost is calculated using `ai_model_pricing` rates at log time — local models have 0 cost but still track tokens and latency for performance comparison
- Budget enforcement runs before every non-cached inference call: the middleware checks the applicable budget rules (global, per-provider, per-operation) against current-month spend. If a budget is exceeded, the `action` determines behaviour: `block` rejects with a `budget-blocked` status, `warn` logs a warning and proceeds, `fallback` attempts a local model if available
- The existing `ai.monthlyTokenBudget` and `ai.budgetExceededFallback` settings are migrated to `ai_budgets` rows with `id: 'global'`
- Provider health checks test connectivity and measure latency — failing providers transition to `error` status and are excluded from inference routing until manually re-enabled or a subsequent health check passes
- Local model providers (Ollama, llama.cpp) are configured with a `base_url` pointing to the local inference server — the middleware uses the same request/response contract regardless of provider type
- Latency percentiles (P50, P75, P95, P99) are computed from `latency_ms` in `ai_inference_log` — no pre-aggregation, calculated at query time from raw logs within the requested time window
- Slow queries are defined as calls exceeding 2x the P95 latency for that model — they are flagged in the dashboard and optionally trigger alerts
- Alert rules support three types: `budget-threshold` (spending reaches N% of limit), `error-spike` (error rate exceeds N% in a rolling window), `latency-degradation` (P95 exceeds threshold for a model)
- Alerts are delivered via the shell notification system and optionally via Moltbot (Telegram) — the same delivery mechanism as Cerebrum's proactive nudges (PRD-084)
- Metric aggregation for the dashboard is computed on-the-fly from `ai_inference_log` — no separate aggregation tables. A BullMQ scheduled job runs daily to compute and cache 30-day rolling summaries for fast dashboard loading
- The monitoring dashboard replaces the existing AI Usage page in the AI Ops app — it is a superset of the current functionality

## Edge Cases

| Case                                                   | Behaviour                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Local model server is unreachable                      | Provider status transitions to `error`, call fails with descriptive message                                                        |
| Budget exceeded mid-batch (e.g., import with 200 txns) | Remaining calls in the batch are blocked/warned per the budget rule — partial results are preserved                                |
| Cloud API returns rate limit (429)                     | Existing retry logic handles it; the attempt is logged with actual latency including wait time                                     |
| Model removed from provider but exists in pricing      | Pricing row marked `active: false`, historical logs retain the model name                                                          |
| Two budget rules apply (global + per-provider)         | The more restrictive rule wins — if either is exceeded, the action triggers                                                        |
| Cache hit                                              | Logged with `cached: 1`, `latency_ms: 0`, `cost_usd: 0` — included in cache hit rate metrics but excluded from latency percentiles |
| Migration: old `ai_usage` rows lack latency data       | Backfilled with `latency_ms: 0` and excluded from latency calculations via a `WHERE latency_ms > 0` filter                         |
| Concurrent budget checks race condition                | Budget check is advisory, not transactional — slight overrun is acceptable for a single-user system                                |
| Ollama model produces no token count                   | Estimate from response length: `tokens ≈ word_count * 1.3` (same approximation as Cerebrum context assembly)                       |

## User Stories

| #   | Story                                                         | Summary                                                                                           | Status      | Parallelisable          |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| 01  | [us-01-provider-registry](us-01-provider-registry.md)         | Provider and model pricing tables, CRUD API, health check, seed Claude defaults                   | Not started | No (first)              |
| 02  | [us-02-inference-log-schema](us-02-inference-log-schema.md)   | `ai_inference_log` table, migration from `ai_usage`, budget tables                                | Not started | Yes                     |
| 03  | [us-03-inference-middleware](us-03-inference-middleware.md)   | Transparent tracking wrapper for all AI calls with automatic provider/model/latency logging       | Not started | Blocked by us-01, us-02 |
| 04  | [us-04-budget-enforcement](us-04-budget-enforcement.md)       | Pre-call budget checks, exceeded actions (block/warn/fallback), budget status API                 | Not started | Blocked by us-02        |
| 05  | [us-05-stats-and-metrics-api](us-05-stats-and-metrics-api.md) | Replaces existing stats/history API with multi-provider, latency, and quality metrics             | Not started | Blocked by us-02        |
| 06  | [us-06-monitoring-dashboard](us-06-monitoring-dashboard.md)   | Enhanced AI Ops dashboard with provider breakdown, latency charts, budget status, quality metrics | Not started | Blocked by us-05        |
| 07  | [us-07-alert-rules](us-07-alert-rules.md)                     | Budget threshold, error spike, and latency degradation alerts with notification delivery          | Not started | Blocked by us-05        |
| 08  | [us-08-log-retention](us-08-log-retention.md)                 | Scheduled cleanup job, configurable retention period, aggregation of aged-out data                | Not started | Blocked by us-02        |

US-01 and US-02 can parallelise. US-03 merges them. US-04, US-05, US-08 can parallelise after US-02. US-06 and US-07 depend on the metrics API (US-05).

## Verification

- An entity matching call during import creates a row in `ai_inference_log` with `provider: 'claude'`, `operation: 'entity-match'`, `domain: 'finance'`, and accurate latency
- A cache hit creates a row with `cached: 1` and `cost_usd: 0`
- Setting a global budget of $5/month and exceeding it blocks subsequent AI calls with `status: 'budget-blocked'`
- The `fallback` exceeded action routes to a local Ollama model when the cloud budget is hit
- The monitoring dashboard shows per-provider cost breakdown, latency percentiles, cache hit rate, and error rate
- A budget threshold alert fires when spending reaches 80% of the global limit
- Historical `ai_usage` rows appear in the new dashboard with `provider: 'claude'` and `latency_ms: 0`
- Adding an Ollama provider via `core.aiProviders.upsert` with a `base_url` enables local model inference
- The retention job deletes raw logs older than the configured period while preserving daily aggregates

## Out of Scope

- Proactive domain-level insights (spending anomalies, warranty alerts — PRD-055)
- AI categorisation rules and prompt management (PRD-053)
- Model fine-tuning or training
- A/B testing between models (future optimisation)
- Real-time streaming metrics (dashboard refreshes on navigation or manual refresh)
- Multi-tenant cost allocation (single-user system)
