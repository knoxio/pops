# US-02: AI usage page

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: Done

## Description

As a user, I want an AI usage page showing costs, token counts, and trends so that I can monitor AI spend.

## Acceptance Criteria

- [x] Stats cards: total cost, API calls, cache hits, cache hit rate, avg cost per call
- [x] Last 30 days section with cost, calls, cache hits
- [x] Daily history chart (line/bar chart showing cost over time)
- [x] Date range filter (start/end date pickers)
- [x] Loading skeletons while data fetches
- [x] Empty state when no AI usage exists
- [x] Cost formatted as USD with appropriate precision

## Notes

Chart uses Recharts (already available in the project). Cost trends help identify if AI spend is growing unexpectedly.
