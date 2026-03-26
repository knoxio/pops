# Epic 00: AI Operations App

> Theme: [AI](../README.md)

## Scope

Build `@pops/app-ai` — the central hub for AI visibility and control across all domains. Usage tracking, cost visualisation, cache management, and configuration for AI capabilities platform-wide.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 052 | [AI Usage & Cost Tracking](../prds/052-ai-usage-cost-tracking/README.md) | Usage page — token counts, cost per domain, cache hit rates, cost trends over time | Partial (basic usage page exists) |
| 053 | [AI Configuration & Rules](../prds/053-ai-configuration-rules/README.md) | Model selection, token budgets, prompt templates, categorisation rule viewer, cache management | Not started |

PRD-052 can be built independently. PRD-053 depends on having usage data to configure against.

## Dependencies

- **Requires:** Foundation (shell, UI components), Finance Epic 06 (AI categorisation generates the usage data)
- **Unlocks:** Visibility into AI costs across all domains

## Out of Scope

- Domain-specific AI behaviour (each domain owns its own AI logic)
- AI overlay assistant (Epic 01)
- AI inference and monitoring (Epic 02)
