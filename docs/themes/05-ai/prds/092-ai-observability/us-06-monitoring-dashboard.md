# US-06: Monitoring Dashboard

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want a comprehensive AI monitoring dashboard that replaces the existing AI Usage page so that I can see cost breakdowns, latency percentiles, quality metrics, provider health, and budget utilization in a single view.

## Acceptance Criteria

- [x] The new dashboard replaces the existing AI Usage page in the AI Ops app (same route, updated component)
- [x] **Hero section** displays four KPI cards: Total Cost (this month, formatted as currency), Total Calls (this month), Cache Hit Rate (percentage), Average Latency (ms). Each card shows a trend indicator comparing to the previous equivalent period (e.g., this month vs last month) — up/down arrow with percentage change, colored green for improvement and red for regression
- [x] **Cost breakdown section** includes: a stacked bar or area chart showing daily cost by provider and model over the selected date range; a summary table with columns for provider, model, calls, input tokens, output tokens, total cost, with daily/weekly/monthly aggregation toggle
- [x] **Latency section** includes: a line chart showing P50, P95, and P99 latency over time (daily data points); a "Slow Queries" table listing the 20 most recent calls exceeding 2x the P95 threshold for their model, showing model, operation, latency, timestamp, and context ID (clickable to navigate to related entity if applicable)
- [x] **Quality section** includes: cache hit rate trend line chart, error rate trend line chart, budget utilization horizontal bar charts (one per budget rule showing spend vs limit)
- [x] **Provider status section** displays a card per registered provider showing: provider name and type (cloud/local), status badge (green for active, red for error), model count, last health check timestamp and latency, total cost attributed to this provider. A "Check Health" button triggers `core.aiProviders.healthCheck` and refreshes the card.
- [x] **Budget overview section** displays: a progress bar per budget rule showing current spend vs limit (color-coded: green < 60%, yellow 60-80%, red > 80%), the budget action (block/warn/fallback), and projected exhaustion date
- [x] A date range picker (preset options: 7d, 30d, 90d, custom) applies to all chart and table sections
- [x] Filter dropdowns for provider, model, domain, and operation apply to all sections
- [x] Dashboard uses the pre-computed summary from `ai.observabilitySummary` settings key for initial render, then fetches live data for the selected filters
- [x] Responsive layout: works on desktop (1200px+) and tablet (768px+). Cards stack vertically on smaller viewports.
- [x] Dashboard matches existing POPS design patterns: uses the same card components, color palette, chart library, and spacing conventions as other POPS pages

## Notes

- The existing AI Usage page is located in the AI Ops frontend app. The new dashboard should replace it in-place, not add a separate route.
- Charts should use whatever charting library POPS already uses (likely Recharts or similar). Do not introduce a new charting dependency.
- The hero section's trend indicators are computed by comparing the selected period to the immediately preceding period of equal length (e.g., last 30 days vs the 30 days before that).
- The "Slow Queries" context ID should link to the relevant import batch or conversation if the ID format is recognizable.
- All data fetching should use the tRPC endpoints from US-05. Avoid direct DB queries from the frontend.
- Consider using React Query's `staleTime` to prevent re-fetching on every filter change — a 30-second stale time is reasonable for this data.
