# Epic 03: AI Observability

> Theme: [AI](../README.md)

## Scope

Build a comprehensive observability layer for all AI inference across POPS — cloud APIs (Claude, future providers), local models (Ollama, llama.cpp), and Cerebrum subsystem operations (embeddings, Ego conversations, Glia curation). Extends the existing usage tracking (PRD-052) with multi-provider support, latency monitoring, quality metrics, budget enforcement, alerting, and a unified monitoring dashboard.

## PRDs

| #   | PRD                                                                 | Summary                                                                                                        | Status      |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 092 | [AI Observability Platform](../prds/092-ai-observability/README.md) | Multi-provider inference tracking, budget enforcement, latency/quality metrics, monitoring dashboard, alerting | Not started |

## Dependencies

- **Requires:** Epic 00 (AI Operations App — existing `ai_usage` table and stats API), BullMQ (PRD-074, for scheduled metric aggregation jobs)
- **Unlocks:** Informed model selection (local vs cloud cost/quality trade-offs), budget safety across Cerebrum workloads, operational visibility as AI usage scales

## Out of Scope

- Proactive domain-level insights like spending anomalies (PRD-055 — AI Inference & Monitoring)
- AI categorisation rules and prompt management (PRD-053)
- Model training or fine-tuning
