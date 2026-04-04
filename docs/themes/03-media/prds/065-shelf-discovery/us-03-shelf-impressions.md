# US-03: Shelf impressions tracking

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As the system, I track which shelves were shown to the user so that freshness scoring can deprioritize recently shown shelves.

## Acceptance Criteria

- [ ] `shelf_impressions` table: id, shelf_id (TEXT), shown_at (TEXT)
- [ ] Index on shelf_id
- [ ] `recordImpressions(shelfIds[])` inserts rows for all shelves shown in a session
- [ ] `getRecentImpressions(days)` returns shelf_id → count map for the last N days
- [ ] Freshness formula: `1 / (1 + countInLast7Days)`, floor at 0.1
- [ ] Cleanup: rows older than 30 days deleted on API startup
- [ ] Tests: record, retrieve counts, freshness calculation, cleanup
