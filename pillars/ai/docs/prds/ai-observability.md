# PRD: AI Observability Platform

> Status: Mostly built — log, providers, budget CRUD/status + evaluation primitives, stats/latency/quality, alerting, summary, and retention all ship; the call-time budget _enforcement_ gate (block/warn/fallback wiring, `budget-blocked` writes, typed error) is not built.

## Purpose

Track every AI inference call across POPS in one log, and turn it into visibility (stats/latency/quality/history), guardrails (budgets), and proactive signals (alerts). Covers cloud APIs (Claude Haiku/Sonnet/Opus), local models (Ollama, llama.cpp), and Cerebrum operations (embeddings, conversations, curation). All aggregation is computed on-the-fly from the raw log; a rolling 30-day summary is cached for fast first paint.

## Data Model

### `ai_inference_log`

| Column        | Type    | Notes                                                                                    |
| ------------- | ------- | ---------------------------------------------------------------------------------------- |
| id            | INTEGER | PK, autoincrement                                                                        |
| provider      | TEXT    | NOT NULL — `claude`, `ollama`, `llama-cpp`, …                                            |
| model         | TEXT    | NOT NULL                                                                                 |
| operation     | TEXT    | NOT NULL — `entity-match`, `rule-generation`, `embedding`, `conversation`, `curation`, … |
| domain        | TEXT    | nullable — `finance`, `cerebrum`, … or null for cross-domain                             |
| input_tokens  | INTEGER | NOT NULL, default 0                                                                      |
| output_tokens | INTEGER | NOT NULL, default 0                                                                      |
| cost_usd      | REAL    | NOT NULL, default 0 — denormalised at write time; 0 for local models                     |
| latency_ms    | INTEGER | NOT NULL, default 0                                                                      |
| status        | TEXT    | NOT NULL, default `success` — `success` / `error` / `timeout` / `budget-blocked`         |
| cached        | INTEGER | NOT NULL, default 0 — 1 if served from cache                                             |
| context_id    | TEXT    | nullable — conversation/import-batch/job grouping key                                    |
| error_message | TEXT    | nullable                                                                                 |
| metadata      | TEXT    | nullable — JSON (e.g. `prompt_version`)                                                  |
| created_at    | TEXT    | NOT NULL — ISO 8601                                                                      |

Indexes: `created_at`, `(provider, model)`, `operation`, `domain`, `context_id`, `status`.

### `ai_inference_daily`

Daily roll-ups written by the retention job: `date`, `provider`, `model`, `operation`, `domain`, plus `total_calls`, `total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `avg_latency_ms`, `error_count`, `timeout_count`, `cache_hit_count`, `budget_blocked_count`. Unique on `(date, provider, model, operation, domain)`.

### `ai_providers`

`id` (slug PK), `name`, `type` (`cloud`/`local`), `base_url` (required for local), `api_key_ref` (settings key, never the raw key), `status` (`active`/`error`), `last_health_check`, `last_latency_ms`, `created_at`, `updated_at`.

### `ai_model_pricing`

`id` PK, `provider_id`, `model_id`, `display_name`, `input_cost_per_mtok`, `output_cost_per_mtok`, `context_window`, `is_default`, timestamps. Unique on `(provider_id, model_id)`.

### `ai_budgets`

`id` (PK — `global`, `provider:{id}`, `operation:{type}`), `scope_type` (`global`/`provider`/`operation`), `scope_value`, `monthly_token_limit`, `monthly_cost_limit`, `action` (`block`/`warn`/`fallback`, default `warn`), timestamps.

### `ai_alert_rules` / `ai_alerts`

- **Rules:** `id` PK, `type` (`budget-threshold`/`error-spike`/`latency-degradation`), `scope_provider`, `scope_model`, `threshold_value`, `window_minutes`, `enabled` (default 1), timestamps.
- **Alerts:** `id` PK, `rule_id` (FK, set-null on delete), `type`, `message`, `severity` (`warning`/`critical`), `scope_detail`, `metric_value`, `threshold_value`, `acknowledged` (default 0), `acknowledged_at`, `created_at`. Indexed for dedupe on `(type, scope_detail, created_at)`.

> Providers and model pricing are **not** seeded by the baseline migration — they are registered at runtime via `POST /ai-providers`. Until a model is priced, cost computation falls back to the default price (`{ input: 1.0, output: 5.0 }` per Mtok).

## REST API Surface

| Method | Path                                     | Purpose                                                            |
| ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/ai-observability/stats`                | Totals + per-provider/model/domain/operation breakdowns            |
| GET    | `/ai-observability/history`              | Daily aggregated records + summary                                 |
| GET    | `/ai-observability/latency`              | P50/P75/P95/P99/avg + `slowQueries`                                |
| GET    | `/ai-observability/quality`              | Per-model cache/error/timeout/budget-block rates + avg latency     |
| GET    | `/ai-providers`                          | List providers with their model pricing                            |
| GET    | `/ai-providers/:providerId`              | One provider with models (null, not 404, if unknown)               |
| POST   | `/ai-providers`                          | Create/update a provider + its pricing (keyed by `id` in body)     |
| POST   | `/ai-providers/:providerId/health-check` | Live health check; persists status + latency                       |
| GET    | `/ai-budgets`                            | List budgets                                                       |
| GET    | `/ai-budgets/status`                     | Budgets with month-to-date usage + projected exhaustion            |
| POST   | `/ai-budgets`                            | Create/update a budget (keyed by `id` in body)                     |
| GET    | `/ai-alerts`                             | List fired alerts (filter: acknowledged/type/severity/date; paged) |
| POST   | `/ai-alerts/:id/acknowledge`             | Acknowledge an alert                                               |
| POST   | `/ai-alerts/run`                         | Run the evaluation cycle now                                       |
| GET    | `/ai-alerts/rules`                       | List alert rules                                                   |
| POST   | `/ai-alerts/rules`                       | Create a rule                                                      |
| GET    | `/ai-alerts/rules/:id`                   | Get a rule (404 if unknown)                                        |
| PATCH  | `/ai-alerts/rules/:id`                   | Update a rule                                                      |
| PATCH  | `/ai-alerts/rules/:id/enabled`           | Enable/disable a rule                                              |
| DELETE | `/ai-alerts/rules/:id`                   | Delete a rule                                                      |
| POST   | `/ai-alerts/rules/seed-defaults`         | Idempotently seed default rules                                    |

All observability endpoints accept conjunctive `provider`/`model`/`domain`/`operation`/`startDate`/`endDate` filters.

## Rules

- Every AI call — cloud, local, or cache hit — is logged via the [telemetry ingest](ai-inference-monitoring.md). Cost is computed at write time from `ai_model_pricing`; local models record 0 cost but real tokens and latency.
- **Budget evaluation** (the pre-call _gate_ is not yet wired — see below). The pillar ships the evaluation primitives: `evaluateBudgetsForCall` sums the applicable rules (global + matching provider + matching operation) against current-month spend and returns the breaches, the **most restrictive** taking priority (cost over token when both are over); `findFallbackProvider` resolves an active local provider for a `fallback` budget. Budget reads fail open — a read error returns no breaches and never blocks. These primitives are unit-tested but not consumed by any call-time path in this pillar; the actual block/warn/fallback _action_ (rejecting the call, writing `status='budget-blocked'` with `cost_usd=0`) is the caller/wrapper's job and is **not yet enforced** — the `@pops/ai-telemetry` wrapper reserves a `GET /ai-budgets/check` pre-call gate that is not built (`libs/ai-telemetry/src/types.ts`). The `budget-blocked` status is a defined log/aggregation value, but nothing in the platform currently writes it. The status surface (`GET /ai-budgets/status`: month-to-date usage, `percentageUsed`, `projectedExhaustionDate`) is built.
- Legacy `ai.monthlyTokenBudget` / `ai.budgetExceededFallback` settings migrate once into a `global` `ai_budgets` row (`skip → block`, `alert → warn`), gated by `ai.budgetSettingsMigrated`, skipped if a global budget already exists.
- **Latency percentiles** are computed application-side from sorted `latency_ms` where `latency_ms > 0` and `status='success'` (SQLite has no percentile function). Cache hits (`latency_ms=0`) are excluded.
- **Slow queries** are calls exceeding 2× the per-model P95.
- **Alerts:** `budget-threshold` fires at N% of a budget limit (`warning` ≥ 80%, `critical` ≥ 95%); `error-spike` fires when the error rate over a rolling window exceeds the threshold; `latency-degradation` fires when a model's windowed P95 exceeds the threshold. Dedupe: at most one alert per `(type, scope_detail)` per hour. Delivery is the nudge feed for all severities plus Telegram for `critical` (warnings only when `POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS=1`); Telegram silently no-ops when unconfigured.
- **Summary + retention** run as in-process, env-gated jobs (no queue). `runSummary` caches a 30-day rolling envelope in the `ai.observabilitySummary` setting for instant dashboard first paint. `runRetention` aggregates `ai_inference_log` rows older than `ai.logRetentionDays` (default 90) into `ai_inference_daily` in batches (10k), each batch in its own transaction, then deletes them; it is idempotent.
- History queries union recent `ai_inference_log` with aged-out `ai_inference_daily` so the timeline is continuous across the retention boundary.

## Edge Cases

| Case                                           | Behaviour                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cache hit                                      | `cached=1`, `latency_ms=0`, `cost_usd=0`; counts toward cache hit rate, not percentiles                                                                      |
| Unknown provider id on `GET /ai-providers/:id` | Returns `null` with 200, not 404                                                                                                                             |
| Two budgets apply (global + per-provider)      | `evaluateBudgetsForCall` returns both breaches with the more restrictive prioritised (cost over token); acting on them is the unbuilt enforcement gate's job |
| Budget read fails                              | Fails open — `evaluateBudgetsForCall` returns no breaches                                                                                                    |
| Local model server unreachable on health check | Provider status → `error`, latency recorded                                                                                                                  |
| Pricing missing for a model                    | Falls back to the default per-Mtok price; no 404                                                                                                             |
| Same alert condition twice within an hour      | Deduplicated — one alert per `(type, scope_detail)` per hour                                                                                                 |

## Acceptance Criteria

- [x] `ai_inference_log`, `ai_inference_daily`, `ai_providers`, `ai_model_pricing`, `ai_budgets`, `ai_alert_rules`, and `ai_alerts` exist with the columns, defaults, and indexes above.
- [x] `GET /ai-observability/stats|history|latency|quality` return correct totals, daily records, ascending percentiles, and per-model quality, all honouring the conjunctive filter set against an empty table without error.
- [x] `GET /ai-providers`, `GET /ai-providers/:id` (nullable), `POST /ai-providers` (upsert + pricing), and `POST /ai-providers/:id/health-check` (status + latency persisted) work; health check transitions `active ↔ error`.
- [x] Budget evaluation primitives work: `evaluateBudgetsForCall` returns the breaches for the matched rules (most-restrictive priority, cost over token), `findFallbackProvider` resolves an active local provider, and budget reads fail open. These are unit-tested but not yet wired into a call-time path.
- [ ] Pre-call budget _enforcement_ — actually blocking/warning/falling back a call, writing `status='budget-blocked'` with `cost_usd=0`, and surfacing a typed error — is **not built**. The `@pops/ai-telemetry` wrapper reserves an unbuilt `GET /ai-budgets/check` gate; no code in the platform writes the `budget-blocked` status today.
- [x] `GET /ai-budgets`, `POST /ai-budgets`, and `GET /ai-budgets/status` (month-to-date usage, `percentageUsed`, `projectedExhaustionDate`) work.
- [x] Legacy budget settings migrate once into a `global` `ai_budgets` row, idempotently.
- [x] Alert rules CRUD + `seed-defaults`, `GET /ai-alerts` (filtered/paged), `POST /ai-alerts/:id/acknowledge`, and `POST /ai-alerts/run` work.
- [x] Budget-threshold, error-spike, and latency-degradation evaluators fire correctly with `(type, scope_detail)` hourly deduplication.
- [x] Every alert is dispatched to the nudge channel; `critical` alerts also go to Telegram when configured, with warnings gated by env; an unconfigured Telegram dispatcher no-ops.
- [x] `runSummary` writes a 30-day envelope to `ai.observabilitySummary` (with `computedAt`); the observability scheduler runs it env-gated, queue-free.
- [x] `runRetention` aggregates aged-out logs into `ai_inference_daily` (batched, per-batch transaction, idempotent) and deletes them; history unions live + daily data.

## Out of Scope

- Proactive domain-level insights (spending anomalies — see [AI Inference & Monitoring](ai-inference-monitoring.md)).
- Categorisation rules and prompt management (finance pillar); model fine-tuning; A/B model testing; real-time streaming metrics.
