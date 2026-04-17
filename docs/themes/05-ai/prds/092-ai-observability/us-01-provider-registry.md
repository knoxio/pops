# US-01: Provider Registry

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want to register and manage AI providers (cloud and local) with their models and pricing so that the observability platform can attribute costs, route fallback calls, and monitor provider health.

## Acceptance Criteria

- [ ] `ai_providers` Drizzle schema exists with columns: `id` (text PK), `name` (text), `type` (enum: `cloud` | `local`), `base_url` (text, nullable — required for `local` type), `api_key_ref` (text, nullable — reference to encrypted settings key), `status` (enum: `active` | `error`), `last_health_check` (timestamp, nullable), `last_latency_ms` (integer, nullable), `created_at`, `updated_at`
- [ ] `ai_model_pricing` Drizzle schema exists with columns: `id` (serial PK), `provider_id` (FK → ai_providers), `model_id` (text), `display_name` (text), `input_cost_per_mtok` (numeric), `output_cost_per_mtok` (numeric), `context_window` (integer, nullable), `is_default` (boolean, default false), `created_at`, `updated_at`
- [ ] Unique constraint on `(provider_id, model_id)` in `ai_model_pricing`
- [ ] tRPC endpoints implemented: `core.aiProviders.list` returns all providers with their models; `core.aiProviders.get` returns a single provider by ID with models and recent health data; `core.aiProviders.upsert` creates or updates a provider and its model pricing rows; `core.aiProviders.healthCheck` calls the provider endpoint (e.g., Anthropic messages API with minimal prompt, Ollama `/api/tags`) and records latency
- [ ] Health check transitions provider status: on success → `active` (records latency); on failure → `error` (records error in logs)
- [ ] Provider can transition from `error` back to `active` via a passing health check or manual re-enable through `upsert`
- [ ] Seed migration registers Claude as default provider (`type: 'cloud'`) with three models: `claude-haiku-4-5-20251001` ($1/$5 per MTok), `claude-sonnet-4-20250514` ($3/$15 per MTok), `claude-opus-4-20250514` ($15/$75 per MTok)
- [ ] Local provider support: Ollama provider can be registered with `type: 'local'` and a `base_url` (e.g., `http://localhost:11434`); health check hits `{base_url}/api/tags`
- [ ] Unit test: upsert a provider, verify it appears in list; run health check against a mock endpoint, verify status and latency are updated

## Notes

- Provider `id` should be a human-readable slug (e.g., `claude`, `ollama-local`) — not a UUID.
- The `api_key_ref` field stores the settings key name where the actual API key lives (e.g., `anthropic.apiKey`), never the raw key.
- Health check for Claude can use a minimal `messages.create` call with max_tokens=1 or hit the `/v1/models` endpoint if available.
- This schema is referenced by US-02 (inference log), US-03 (middleware), and US-04 (budget enforcement).
