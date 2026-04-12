# US-08: Orphaned entity indicators

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Not started

## Description

As a user, I want to see which entities have zero transactions on the `/finance/entities` page so that I can identify and clean up orphaned entities.

## Acceptance Criteria

- [ ] The entities query performs a LEFT JOIN from entities to transactions and includes a `transactionCount` (or equivalent) in the response.
- [ ] Entities with `transactionCount = 0` display an "Orphaned" badge in the entity list.
- [ ] An entity with only "skipped" transactions is NOT considered orphaned — any transaction association (regardless of status) counts.
- [ ] A "Show orphaned only" filter toggle is available on the entities page. When active, only entities with zero transactions are displayed.
- [ ] The filter toggle state does not persist across page navigations (resets to "show all" on mount).
- [ ] The "Orphaned" badge is visually distinct (e.g. muted colour, warning style) and does not interfere with existing entity badges or status indicators.

## Notes

This story is fully independent of all other stories in this PRD. The LEFT JOIN should be efficient — entities and transactions are already indexed on the join key. If the entities page uses pagination, the count must be computed per page (not fetched for the entire table upfront).
