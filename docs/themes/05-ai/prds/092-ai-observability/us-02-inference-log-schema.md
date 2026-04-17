# US-02: Inference Log Schema

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As the observability platform, I need a comprehensive inference log schema that captures every AI call's provider, model, operation, domain, tokens, cost, latency, and status so that all downstream features (stats, budgets, alerts, dashboards) have a single source of truth.

## Acceptance Criteria

- [ ] `ai_inference_log` Drizzle schema exists with columns: `id` (serial PK), `provider` (text, NOT NULL), `model` (text, NOT NULL), `operation` (text, NOT NULL — e.g., `entity-match`, `rule-generation`, `embedding`, `conversation`, `curation`), `domain` (text, nullable — e.g., `finance`, `general`), `input_tokens` (integer, NOT NULL, default 0), `output_tokens` (integer, NOT NULL, default 0), `cost_usd` (numeric, NOT NULL, default 0), `latency_ms` (integer, NOT NULL, default 0), `status` (enum: `success` | `error` | `timeout` | `budget-blocked`, NOT NULL), `context_id` (text, nullable — import batch ID, conversation ID, or job ID), `error_message` (text, nullable), `cached` (boolean, NOT NULL, default false), `metadata` (jsonb, nullable), `created_at` (timestamp, NOT NULL, default now())
- [ ] Migration script renames `ai_usage` table to `ai_inference_log`
- [ ] Migration adds new columns: `provider`, `model`, `operation`, `domain`, `latency_ms`, `status`, `context_id`, `error_message`, `cached`, `metadata`
- [ ] Migration backfills existing rows with: `provider='claude'`, `model='claude-haiku-4-5-20251001'`, `operation='entity-match'`, `domain='finance'`, `latency_ms=0`, `status='success'`, `cached=false`
- [ ] `ai_budgets` Drizzle schema exists with columns: `id` (text PK — e.g., `global`, `provider:claude`, `operation:entity-match`), `scope_type` (enum: `global` | `provider` | `operation`), `scope_value` (text, nullable — provider ID or operation name), `monthly_token_limit` (integer, nullable), `monthly_cost_limit` (numeric, nullable), `action` (enum: `block` | `warn` | `fallback`, NOT NULL, default `warn`), `created_at`, `updated_at`
- [ ] Migration reads existing `ai.monthlyTokenBudget` setting and creates an `ai_budgets` row with `id='global'`, `scope_type='global'`, `monthly_token_limit` set to the existing value, `action` set based on `ai.budgetExceededFallback` setting (`true` → `fallback`, `false` → `block`)
- [ ] Indexes created on: `created_at`, `(provider, model)` composite, `operation`, `domain`, `context_id`, `status`
- [ ] All references to `ai_usage` in the existing codebase (service.ts, router.ts, schema files) are updated to use `ai_inference_log`
- [ ] Existing queries (getStats, getHistory, etc.) continue to work against the renamed table with no regressions

## Notes

- The `cost_usd` column is computed at write time by the inference middleware (US-03) using pricing from `ai_model_pricing` (US-01). It is stored denormalized for fast aggregation.
- The `metadata` jsonb column is for extensibility — e.g., storing the prompt hash, response quality score, or model-specific fields.
- The `ai_budgets.id` convention: `global` for the system-wide budget, `provider:{id}` for per-provider, `operation:{name}` for per-operation.
- Keep the migration idempotent — check if columns/table already exist before altering.
- The backfill values assume all existing rows came from the entity-match categorizer using Claude Haiku — this matches the current implementation.
