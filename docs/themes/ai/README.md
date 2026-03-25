# Theme: AI

AI capabilities in POPS span three layers (see [roadmap](../../roadmap.md)):

1. **Categorisation** — Automated data entry, entity matching, tagging. Already partially exists in the finance import pipeline. Extends to each new domain.
2. **Overlay** — Contextual assistant in the shell. Interactive — query across domains, suggest actions.
3. **Inference** — Proactive monitoring, anomaly detection, smart automations. Moltbot alerts, scheduled analysis.

## Platform-Level AI Operations

Before the AI layers are built out, POPS already uses AI (Claude Haiku API) for transaction categorisation and entity matching. This usage needs its own operational app — not buried inside the finance app — because:

- AI usage spans multiple domains (finance today, media/inventory/others tomorrow)
- Cost tracking, token budgets, and cache hit rates are platform concerns
- The AI usage page currently lives in `@pops/app-finance` but queries `core.aiUsage` (a core module, not finance-specific)

The first step is extracting AI usage into its own app package (`@pops/app-ai`).

## Epics

| # | Epic | Status | PRD |
|---|------|--------|-----|
| 01 | AI Operations App | Done | [PRD-025](../../specs/prd-025-ai-operations-app.md) |
| 02 | AI Overlay | Not started | — |
| 03 | AI Inference | Not started | — |

Epics 02 and 03 are Phase 3. Epic 01 is a Phase 2 extraction.
