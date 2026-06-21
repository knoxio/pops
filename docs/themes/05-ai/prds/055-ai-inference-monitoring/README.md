# PRD-055: AI Inference & Monitoring

> Epic: [02 — AI Inference](../../epics/02-ai-inference.md)
> Status: In progress

## Overview

Own the AI-ops backend — inference telemetry, observability, providers, model pricing, budgets, and alerts — as a standalone `ai` pillar, and make telemetry real with a cross-pillar ingest. On top of that foundation, build proactive AI capabilities: anomaly detection, smart automations, and scheduled analysis that surface insights before the user asks, delivered via Moltbot over Telegram.

## Capabilities

- **Spending anomalies:** "Your electricity bill jumped 40% this month"
- **Warranty alerts:** "MacBook warranty expires in 14 days"
- **Pattern detection:** "You spent 30% more on dining this month vs average"
- **Scheduled reports:** Weekly/monthly spending summaries via Telegram
- **Cross-domain insights:** "You bought a new TV (inventory) — your electronics spend (finance) is up 200%"

## User Stories

| #   | Story                                                       | Summary                                                                 | Status      | Parallelisable   |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-anomaly-detection](us-01-anomaly-detection.md)       | Detect spending anomalies (spikes, unusual patterns) and surface alerts | Not started | No (first)       |
| 02  | [us-02-scheduled-analysis](us-02-scheduled-analysis.md)     | Periodic analysis jobs (weekly/monthly summaries)                       | Not started | Blocked by us-01 |
| 03  | [us-03-moltbot-alerts](us-03-moltbot-alerts.md)             | Deliver insights via Telegram through Moltbot                           | Not started | Blocked by us-01 |
| 04  | [us-04-threshold-config](us-04-threshold-config.md)         | Configurable alert thresholds (what % change triggers an alert)         | Not started | Blocked by us-01 |
| 05  | [us-05-ai-pillar-extraction](us-05-ai-pillar-extraction.md) | Extract the AI-ops backend + dashboard into a standalone `ai` pillar    | Done        | No (foundation)  |
| 06  | [us-06-inference-ingest](us-06-inference-ingest.md)         | `POST /ai-usage/record` ingest + `GET /ai-pricing/:p/:m` pricing read   | Done        | Blocked by us-05 |

## Out of Scope

- Interactive assistant (PRD-054)
- Training custom models
- Real-time streaming analysis

## Drift Check

last checked: 2026-04-17
