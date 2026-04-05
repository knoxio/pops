# US-03: Shelf impressions tracking

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As the system, I track which shelves were shown to the user so that freshness scoring can deprioritize recently shown shelves.

## Acceptance Criteria

- [x] `shelf_impressions` table: id, shelf_id (TEXT), shown_at (TEXT)
- [x] Index on shelf_id
- [x] `recordImpressions(shelfIds[])` inserts rows for all shelves shown in a session
- [x] `getRecentImpressions(days)` returns shelf_id → count map for the last N days
- [x] Freshness formula: `1 / (1 + countInLast7Days)`, floor at 0.1
- [x] Cleanup: rows older than 30 days deleted on API startup
- [x] Tests: record, retrieve counts, freshness calculation, cleanup
