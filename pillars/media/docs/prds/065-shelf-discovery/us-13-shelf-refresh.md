# US-13: Shelf refresh

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want a "Refresh" button that re-runs assembly for a completely new shelf selection and item ordering without a full page reload.

## Acceptance Criteria

- [x] "Refresh" button visible at top of discover page (next to title)
- [x] Click re-calls `assembleSession` — new shelf selection, new jitter, new order
- [x] Smooth transition: existing shelves fade out, new shelves fade in (no jarring flash)
- [x] Impressions recorded for the new session
- [x] Button disabled while assembly is in progress
- [x] Tests: refresh produces different shelf set, impressions updated
