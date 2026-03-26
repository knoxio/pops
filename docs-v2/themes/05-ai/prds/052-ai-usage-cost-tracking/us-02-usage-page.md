# US-02: AI usage page

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: Partial

## Description

As a user, I want an AI usage page showing costs, token counts, and trends so that I can monitor AI spend.

## Acceptance Criteria

- [x] Stats cards: total cost, API calls, cache hits, cache hit rate, avg cost per call
- [x] Last 30 days section with cost, calls, cache hits
- [ ] Daily history chart (line/bar chart showing cost over time) — no chart component; history data is fetched but displayed as a DataTable, not a chart
- [ ] Date range filter (start/end date pickers) — no date range filter UI
- [x] Loading skeletons while data fetches
- [x] Empty state when no AI usage exists
- [x] Cost formatted as USD with appropriate precision

## Notes

Chart uses Recharts (already available in the project). Cost trends help identify if AI spend is growing unexpectedly.

**Audit findings** (`packages/app-ai/src/pages/AiUsagePage.tsx`): Stats cards, last 30 days, loading skeleton, and empty state are all implemented. No Recharts chart — history shown as DataTable instead. No date range filter (date inputs not present).
