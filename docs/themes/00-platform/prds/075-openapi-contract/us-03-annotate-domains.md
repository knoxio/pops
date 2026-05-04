# US-03: Annotate Domain Procedures

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Done

## Description

As an external service developer, I access finance, media, and inventory data via REST so that the Cortex service and future integrations can query domain data without tRPC.

## Acceptance Criteria

- [x] Finance: `transactions.list`, `transactions.get`, `budgets.list`, `entities.list` annotated
- [x] Media: `movies.list`, `movies.get`, `tvShows.list`, `tvShows.get`, `watchHistory.list`, `watchlist.list` annotated
- [x] Inventory: `items.list`, `items.get`, `locations.list`, `connections.list` annotated
- [x] Each annotation includes HTTP method, path, summary, description
- [x] All annotated procedures callable via curl with correct responses
- [x] Spec includes accurate request/response schemas derived from Zod definitions

## Notes

Focus on read-heavy procedures first — the Cortex service primarily reads domain data for context. Write procedures (transaction create, item update) are lower priority and can be annotated incrementally.
