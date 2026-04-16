# US-03: Annotate Domain Procedures

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Not started

## Description

As an external service developer, I access finance, media, and inventory data via REST so that the Cortex service and future integrations can query domain data without tRPC.

## Acceptance Criteria

- [ ] Finance: `transactions.list`, `transactions.get`, `budgets.list`, `entities.list` annotated
- [ ] Media: `movies.list`, `movies.get`, `tvShows.list`, `tvShows.get`, `watchHistory.list`, `watchlist.list` annotated
- [ ] Inventory: `items.list`, `items.get`, `locations.list`, `connections.list` annotated
- [ ] Each annotation includes HTTP method, path, summary, description
- [ ] All annotated procedures callable via curl with correct responses
- [ ] Spec includes accurate request/response schemas

## Notes

Focus on read-heavy procedures first — the Cortex service primarily reads domain data for context. Write procedures (transaction create, item update) are lower priority and can be annotated incrementally.
