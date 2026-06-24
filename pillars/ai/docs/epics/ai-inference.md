# Epic: AI Inference

> Pillar: [AI Ops](../README.md)

## Scope

Two layers:

1. **Foundation (built).** The AI Ops backend is a standalone pillar with its own `ai.db`, and telemetry is real: a single internal ingest (`POST /ai-usage/record`) is the one production write path into `ai_inference_log`. Every pillar that calls a model reports usage/cost/latency/cache/error through the `@pops/ai-telemetry` wrapper, which fetches pricing from `GET /ai-pricing/:provider/:model` to shape cost before posting.

2. **Proactive monitoring (not built).** On top of that telemetry: spending-anomaly detection, scheduled weekly/monthly summaries, and Telegram delivery of those summaries via Moltbot, with configurable thresholds. None of this is implemented — it is captured as an idea, not a requirement.

## PRDs

| PRD                                                                    | Summary                                                                    | Status  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- |
| [AI Inference & Monitoring](../prds/ai-inference-monitoring/README.md) | Pillar + telemetry ingest (done); proactive anomaly/summary/Moltbot (idea) | Partial |

## Boundaries

**In:** the standalone pillar, the cross-pillar telemetry ingest, the pricing read.

**Out:** the multi-provider observability dashboard, budgets, and alerting ([AI Observability](ai-observability.md)); the interactive assistant (Cerebrum/Ego); model training.
