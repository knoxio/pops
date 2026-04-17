# US-02: Inference Log Schema

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As the observability platform, I need a comprehensive inference log schema that captures every AI call's provider, model, operation, domain, tokens, cost, latency, and status so that all downstream features (stats, budgets, alerts, dashboards) have a single source of truth.

## Acceptance Criteria

- [ ] `ai_inference_log` Drizzle schema exists with columns: `id` (INTEGER PK, auto-increment), `provider` (TEXT, NOT NULL), `model` (TEXT, NOT NULL), `operation` (TEXT, NOT NULL — e.g., `entity-match`, `rule-generation`, `embedding`, `conversation`, `curation`), `domain` (TEXT, nullable — e.g., `finance`, `general`), `input_tokens` (INTEGER, NOT NULL, default 0), `output_tokens` (INTEGER, NOT NULL, default 0), `cost_usd` (REAL, NOT NULL, default 0), `latency_ms` (INTEGER, NOT NULL, default 0), `status` (TEXT, NOT NULL — `success`, `error`, `timeout`, `budget-blocked`), `context_id` (TEXT, nullable — import batch ID, conversation ID, or job ID), `error_message` (TEXT, nullable), `cached` (INTEGER, NOT NULL, default 0), `metadata` (TEXT, nullable — JSON), `created_at` (TEXT, NOT NULL — ISO 8601)
- [ ] Migration script renames `ai_usage` table to `ai_inference_log`
- [ ] Migration adds new columns: `provider`, `model`, `operation`, `domain`, `latency_ms`, `status`, `context_id`, `error_message`, `cached`, `metadata`
- [ ] Migration backfills existing rows with: `provider='claude'`, `model='claude-haiku-4-5-20251001'`, `operation='entity-match'`, `domain='finance'`, `latency_ms=0`, `status='success'`, `cached=0`
- [ ] `ai_budgets` Drizzle schema exists with columns: `id` (TEXT PK — e.g., `global`, `provider:claude`, `operation:entity-match`), `scope_type` (TEXT, NOT NULL — `global`, `provider`, `operation`), `scope_value` (TEXT, nullable — provider ID or operation name), `monthly_token_limit` (INTEGER, nullable), `monthly_cost_limit` (REAL, nullable), `action` (TEXT, NOT NULL, default `'warn'` — `block`, `warn`, `fallback`), `created_at` (TEXT, NOT NULL — ISO 8601), `updated_at` (TEXT, NOT NULL — ISO 8601)
- [ ] Migration reads existing `ai.monthlyTokenBudget` setting and creates an `ai_budgets` row with `id='global'`, `scope_type='global'`, `monthly_token_limit` set to the existing value, `action` set based on `ai.budgetExceededFallback` setting (`'skip'` → `'block'`, `'alert'` → `'warn'`, unset or unrecognized → `'warn'`)
- [ ] Indexes created on: `created_at`, `(provider, model)` composite, `operation`, `domain`, `context_id`, `status`
- [ ] All references to `ai_usage` in the existing codebase (service.ts, router.ts, schema files) are updated to use `ai_inference_log`
- [ ] Existing queries (getStats, getHistory, etc.) continue to work against the renamed table with no regressions

## Notes

- The `cost_usd` column is computed at write time by the inference middleware (US-03) using pricing from `ai_model_pricing` (US-01). It is stored denormalized for fast aggregation.
- The `metadata` column (JSON stored as TEXT) is for extensibility — e.g., storing the prompt hash, response quality score, or model-specific fields.
- The `ai_budgets.id` convention: `global` for the system-wide budget, `provider:{id}` for per-provider, `operation:{name}` for per-operation.
- Keep the migration idempotent — check if columns/table already exist before altering.
- The backfill values assume all existing rows came from the entity-match categorizer using Claude Haiku — this matches the current implementation.
