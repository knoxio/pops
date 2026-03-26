# US-02: AI usage page

> PRD: [052 — AI Usage & Cost Tracking](README.md)
> Status: To Review

## Description

As a user, I want an AI usage page showing costs, token counts, and trends so that I can monitor AI spend.

## Acceptance Criteria

- [ ] Stats cards: total cost, API calls, cache hits, cache hit rate, avg cost per call
- [ ] Last 30 days section with cost, calls, cache hits
- [ ] Daily history chart (line/bar chart showing cost over time)
- [ ] Date range filter (start/end date pickers)
- [ ] Loading skeletons while data fetches
- [ ] Empty state when no AI usage exists
- [ ] Cost formatted as USD with appropriate precision

## Notes

Chart uses Recharts (already available in the project). Cost trends help identify if AI spend is growing unexpectedly.
