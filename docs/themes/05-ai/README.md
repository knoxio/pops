# Theme: AI

> Make POPS proactive — categorise, assist, and surface insights automatically.

## Strategic Objective

Build three layers of AI capability: categorisation (automated data entry and matching), overlay (contextual assistant in the shell), and inference (proactive monitoring, anomaly detection, alerts). AI usage spans all domains — cost tracking, token budgets, and model configuration belong in a central hub, not embedded in individual apps.

## Success Criteria

- AI operations app provides visibility into usage, costs, and cache hit rates across all domains
- Categorisation reduces manual data entry over time as the system learns
- Overlay assistant can query across domains and suggest actions contextually
- Inference surfaces anomalies and insights before the user asks

## Epics

| #   | Epic                                               | Summary                                                                                   | Status      |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| 0   | [AI Operations App](epics/00-ai-operations-app.md) | `@pops/app-ai` — usage tracking, cost visualisation, model config, categorisation rules   | Partial     |
| 1   | [AI Overlay](epics/01-ai-overlay.md)               | Superseded by Cerebrum Epic 05 (Ego)                                                      | Superseded  |
| 2   | [AI Inference](epics/02-ai-inference.md)           | Proactive monitoring, anomaly detection, Moltbot alerts, scheduled analysis               | Not started |
| 3   | [AI Observability](epics/03-ai-observability.md)   | Multi-provider inference tracking, budget enforcement, latency/quality metrics, dashboard | Not started |

Epic 0 is Phase 2. Epics 2-3 are Phase 3 — they need multiple domains with real data to be useful. Epic 1 is superseded by Cerebrum Ego (PRD-087).

## Key Decisions

| Decision         | Choice                                | Rationale                                                                                                     |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AI providers     | Multi-provider (Claude + local)       | Claude for cloud inference, Ollama/llama.cpp for local — provider abstraction enables cost/quality trade-offs |
| Caching          | Disk cache per domain                 | Avoid repeat API calls for same inputs                                                                        |
| Operations scope | Platform-level, not per-app           | AI usage is a cross-cutting concern                                                                           |
| Observability    | Unified inference log                 | Every AI call (cloud, local, cached) tracked in one table with provider/model/domain metadata                 |
| Budget scope     | Global + per-provider + per-operation | Granular budget control as Cerebrum workloads scale AI usage                                                  |

## Risks

- **AI cost creep** — More domains = more API calls. Mitigation: aggressive caching, corrections reduce AI dependency over time
- **Overlay complexity** — Cross-domain queries need a unified data model. Mitigation: start simple, use universal object URIs (ADR-010)
- **Inference noise** — Too many alerts become spam. Mitigation: configurable thresholds, start conservative

## Out of Scope

- Training custom models or fine-tuning
- General-purpose chatbot (Ego is POPS-specific — see Cerebrum theme)
