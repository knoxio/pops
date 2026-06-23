# Epic: AI Observability

> Pillar: [AI Ops](../README.md)

## Scope

The observability layer over every AI inference call in POPS — cloud APIs (Claude Haiku/Sonnet/Opus), local models (Ollama, llama.cpp), and Cerebrum operations (embeddings, Ego conversations, Glia curation). It owns:

- The unified `ai_inference_log` and its daily roll-up `ai_inference_daily`.
- The provider registry (`ai_providers`) and model pricing (`ai_model_pricing`) with health checks.
- Budgets (`ai_budgets`) — CRUD, month-to-date status, and the pre-call evaluation primitives (breach detection, fallback-provider lookup) against current-month spend. The call-time block/warn/fallback _gate_ that consumes them is not yet wired.
- Stats, latency-percentile, quality-metric, and history APIs computed on-the-fly from the log.
- Alert rules and fired alerts (`ai_alert_rules`, `ai_alerts`) delivered via the nudge feed and Telegram.
- A nightly summary cache and a retention job that aggregates and prunes aged-out logs.

## PRDs

| PRD                                                             | Summary                                                                            | Status                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [AI Observability Platform](../prds/ai-observability/README.md) | Inference log, providers, budgets, stats/latency/quality APIs, alerting, retention | Mostly built — pre-call budget _enforcement_ gate unbuilt |

## Boundaries

**In:** multi-provider tracking, budget CRUD/status + evaluation primitives, latency/quality metrics, alerting, retention, the summary cache.

**Not yet built:** the call-time budget _enforcement_ gate (block/warn/fallback wiring + `budget-blocked` writes) — the evaluation primitives ship, but nothing consumes them at call time.

**Out:** proactive domain-level insights (spending anomalies — [AI Inference](ai-inference.md)); categorisation rules and prompt management (finance pillar); model fine-tuning; real-time streaming metrics.
