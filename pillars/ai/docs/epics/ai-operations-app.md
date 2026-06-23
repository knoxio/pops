# Epic: AI Operations App

> Pillar: [AI Ops](../README.md)

## Scope

The AI Ops dashboard — the pillar's `app` surface, mounted by the shell at `/ai/*`. It gives platform-wide visibility into AI usage and cost, and hosts the cache-maintenance UI.

The app has two pages:

- **AI Usage** (`/ai`) — the observability dashboard: KPI cards (cost, calls, cache hit rate, error rate), per-provider/model/domain/operation cost breakdowns, latency percentiles, quality metrics, and a usage history chart with a date-range filter.
- **Cache** (`/ai/cache`) — view AI entity-cache stats (entry count, on-disk size), clear stale entries older than N days, or clear the whole cache.

Three legacy routes redirect to the finance pillar / settings rather than rendering here: `/ai/rules → /finance/rules`, `/ai/prompts → /finance/prompts`, `/ai/config → /settings#ai.config`.

## PRDs

| PRD                                                                  | Summary                                                        | Status  |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| [AI Usage & Cost Tracking](../prds/ai-usage-cost-tracking/README.md) | The usage dashboard — KPIs, breakdowns, latency, history chart | Done    |
| [AI Configuration & Rules](../prds/ai-configuration-rules/README.md) | Cache maintenance (here) + cross-refs to finance-owned config  | Partial |

## Boundaries

**In:** the dashboard UI, the cache-management UI, the navigation config (`id: ai`, label `AI`, icon `Bot`, colour `violet`, base path `/ai`).

**Out:** the telemetry/observability/budget/alert REST surface (its own PRDs); categorisation rules, prompt templates, and the cache backend (finance pillar); the AI overlay assistant (Cerebrum/Ego).
