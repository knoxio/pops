# Idea: Proactive AI Monitoring

> Pillar: [AI Ops](../README.md)
> Status: Not built — depends on the [telemetry foundation](../prds/ai-inference-monitoring/README.md), which is in place.

The telemetry ingest, observability dashboards, budgets, and alerting all exist. What does **not** exist is the proactive, domain-level insight layer that turns that data (and cross-pillar data) into unprompted notifications. This idea captures it; nothing here is implemented.

## What it would add

- **Spending anomaly detection.** Compare current-period spend against a rolling historical average per category; flag categories whose spend exceeds a configurable threshold above average (e.g. +50%). Store anomalies (`category`, current amount, average amount, percentage change) and surface them. Start simple — percentage deviation from a rolling average — with Claude-assisted analysis as a later refinement.
- **Scheduled analysis.** Weekly summaries (top categories, notable changes, budget status) and monthly summaries (total spend, category breakdown, year-over-year). Structured first; natural-language summaries via Claude later. Configurable cadence (e.g. weekly on Sunday, monthly on the 1st).
- **Moltbot (Telegram) delivery.** Push anomaly alerts and scheduled summaries to Telegram via Moltbot, formatted as markdown, with the relevant amounts/percentages and links to POPS pages via universal URIs. Restricted to a whitelisted owner chat. This turns Moltbot from reactive (command-driven) to proactive (outbound).
- **Configurable anomaly thresholds.** A default trigger (e.g. +50% above average), overridable globally or per category, stored in settings, with the ability to disable anomaly alerts entirely. Naturally-stable categories (rent, mortgage) should be exemptable.

## Cross-domain ambition

The richer payoff is cross-pillar: "you bought a new TV (inventory) — electronics spend (finance) is up 200%", or "MacBook warranty expires in 14 days". This needs a unified read across pillars (via the SDK `pillar()` calls) and the universal-URI layer, and is the most speculative part of the idea.

## Notes / constraints

- Anomaly/summary data is domain data (finance spend, inventory warranties), not AI telemetry — the source-of-truth reads belong to those pillars; this pillar would orchestrate and notify.
- The existing AI alerting (budget/error/latency, nudge + Telegram channels) is about the _AI system's own health_, not about the user's spending. The proactive layer reuses the delivery channels but operates on a different data source.
- Keep alerts conservative — too many becomes spam; thresholds must be tunable from the start.
