# US-01: Warranty tiers

> PRD: [050 — Warranty Tracking](README.md)
> Status: Done

## Description

As a user, I want a warranty tracking page that groups items by expiry urgency so that I can see at a glance which warranties need attention.

## Acceptance Criteria

- [x] Page at `/inventory/warranties` — accessible from inventory navigation
- [x] Page fetches all warranty items via `inventory.reports.warranties` (single API call)
- [x] Items grouped into 5 tiers based on `daysRemaining`: <30d (red), 30-60d (yellow/orange), 60-90d (orange), >90d (green), expired (grey)
- [x] Each tier rendered as a collapsible section with header showing: tier label, colour indicator, item count
- [x] Expiring tiers (<30d, 30-60d, 60-90d) always expanded, not collapsible
- [x] Active tier (>90d) collapsible, expanded by default
- [x] Expired tier collapsible, collapsed by default
- [x] Items within each tier sorted by warranty expiry date ascending (most urgent first)
- [x] Tier colour applied to the section header background or left border
- [x] Tiers with zero items hidden entirely (no empty tier headers)
- [x] Loading skeleton while data fetches
- [x] Page title: "Warranties"

## Notes

Tier calculation and sorting happen server-side — the API returns items pre-sorted with a `tier` field. The client groups by tier and renders sections in the defined order. Tier thresholds (30/60/90) are not configurable in the UI but are constants that can be adjusted if needed.
