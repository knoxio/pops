# AI Ops Pillar

> Cross-cutting AI observability, cost tracking, budget enforcement, and alerting for every pillar that calls a model.

`@pops/ai` is the independent REST pillar that owns AI operations telemetry. It runs as the `pops-ai` container on port 3008, owns its own `ai.db` (SQLite), serves a ts-rest + zod contract, exports `./manifest`, and self-registers with the `registry` pillar on boot.

AI usage is a platform-wide concern: every pillar that calls Claude (or a local model) reports its usage, cost, latency, cache state, and errors to this pillar through a single internal ingest. The pillar aggregates that telemetry into dashboards, enforces spending budgets, and fires alerts when budgets, error rates, or latency degrade.

## Strategic Objective

Give POPS one place to see and control all AI spend and reliability. No pillar embeds its own cost dashboard; they emit telemetry, and this pillar turns it into visibility (usage/latency/quality), guardrails (budgets), and proactive signals (alerts via in-app nudges and Telegram).

## Success Criteria

- Every AI inference call across all pillars — cloud, local, or cache hit — lands in one inference log with provider/model/operation/domain/latency/cost.
- Operators can see cost-per-provider/model/domain, latency percentiles, cache hit rate, and error rate in a single dashboard.
- Monthly token/cost budgets (global, per-provider, per-operation) are defined, tracked month-to-date, and evaluated for breaches; the pre-call gate that would block, warn, or fall back to a local model before an over-budget call hits the provider is specified but not yet wired.
- Budget-threshold, error-spike, and latency-degradation alerts reach the operator via the shell nudge feed and Telegram.

## Epics

| #   | Epic                                            | Summary                                                                                          | Status                                                  |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 0   | [AI Operations App](epics/ai-operations-app.md) | The AI Ops dashboard surface — usage/cost visualisation and cache maintenance UI                 | Done                                                    |
| 2   | [AI Inference](epics/ai-inference.md)           | Pillar extraction + cross-pillar telemetry ingest, then proactive monitoring (unbuilt)           | Partial                                                 |
| 3   | [AI Observability](epics/ai-observability.md)   | Multi-provider inference tracking, budgets (CRUD/status/eval), latency/quality metrics, alerting | Mostly built — pre-call budget enforcement gate unbuilt |

## Data Ownership

| Table                | Purpose                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `ai_inference_log`   | Every AI call — provider, model, operation, domain, tokens, cost, latency, status, cached |
| `ai_inference_daily` | Daily roll-ups of aged-out log rows (written by the retention job)                        |
| `ai_providers`       | Registered cloud/local providers with health + base URL                                   |
| `ai_model_pricing`   | Per-model input/output cost per million tokens                                            |
| `ai_budgets`         | Monthly token/cost limits by scope (global / provider / operation)                        |
| `ai_alert_rules`     | Budget-threshold / error-spike / latency-degradation rule definitions                     |
| `ai_alerts`          | Fired alerts with severity, metric value, acknowledgement state                           |
| `settings`           | The pillar's own `ai.*` settings (model defaults, budgets, retention, summary cache)      |

## Key Decisions

| Decision          | Choice                                         | Rationale                                                                                        |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Telemetry ingest  | Single internal `POST /ai-usage/record`        | One write path into `ai_inference_log`; the `@pops/ai-telemetry` wrapper is the only producer    |
| Providers         | Multi-provider (cloud + local)                 | Claude for cloud, Ollama/llama.cpp for local — provider abstraction enables cost/quality choices |
| Budget scope      | Global + per-provider + per-operation          | Granular control as cross-pillar AI workloads grow; the most restrictive rule wins               |
| Aggregation       | On-the-fly from raw logs, no pre-agg tables    | Percentiles and breakdowns computed at query time; a rolling summary is cached for first paint   |
| Scheduling        | In-process, env-gated `setInterval` (no queue) | The pillar carries no Redis/BullMQ; summary, retention, and alert jobs run queue-free            |
| Cache maintenance | Lives in the finance pillar                    | The entity cache is finance-categorizer state, not AI-ops telemetry — see PRD cross-ref below    |

## Out of Scope (here)

- **AI categorisation rules, prompt templates, and the entity cache** — owned by the finance pillar. The AI Ops app links out to `/finance/rules`, `/finance/prompts`, and reads cache stats from finance's `/ai-usage/cache` surface. See [PRD: AI Configuration & Rules](prds/ai-configuration-rules/README.md).
- **Proactive domain-level insights** (spending anomalies, warranty alerts, scheduled summaries, Telegram delivery of those) — specified in [PRD: AI Inference & Monitoring](prds/ai-inference-monitoring/README.md); the foundation ships, the proactive layer is an idea.
- Training or fine-tuning models; a general-purpose chatbot (that is Cerebrum/Ego).

## Cross-References

- AI categorisation, rule generation, and the entity cache: `../../finance/docs/`
- Cerebrum nudge feed used as an alert delivery channel: `../../cerebrum/docs/`
- The telemetry wrapper every caller uses: `@pops/ai-telemetry` (`libs/`)
