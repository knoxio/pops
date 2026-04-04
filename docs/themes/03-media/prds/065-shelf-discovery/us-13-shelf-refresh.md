# US-13: Shelf refresh

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want a "Refresh" button that re-runs assembly for a completely new shelf selection and item ordering without a full page reload.

## Acceptance Criteria

- [ ] "Refresh" button visible at top of discover page (next to title)
- [ ] Click re-calls `assembleSession` — new shelf selection, new jitter, new order
- [ ] Smooth transition: existing shelves fade out, new shelves fade in (no jarring flash)
- [ ] Impressions recorded for the new session
- [ ] Button disabled while assembly is in progress
- [ ] Tests: refresh produces different shelf set, impressions updated
