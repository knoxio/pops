# US-01: Warranty tiers

> PRD: [050 — Warranty Tracking](README.md)
> Status: To Review

## Description

As a user, I want a warranty tracking page that groups items by expiry urgency so that I can see at a glance which warranties need attention.

## Acceptance Criteria

- [ ] Page at `/inventory/warranties` — accessible from inventory navigation
- [ ] Page fetches all warranty items via `inventory.warranties.list` (single API call)
- [ ] Items grouped into 5 tiers based on `daysRemaining`: <30d (red), 30-60d (yellow/orange), 60-90d (orange), >90d (green), expired (grey)
- [ ] Each tier rendered as a collapsible section with header showing: tier label, colour indicator, item count
- [ ] Expiring tiers (<30d, 30-60d, 60-90d) always expanded, not collapsible
- [ ] Active tier (>90d) collapsible, expanded by default
- [ ] Expired tier collapsible, collapsed by default
- [ ] Items within each tier sorted by warranty expiry date ascending (most urgent first)
- [ ] Tier colour applied to the section header background or left border
- [ ] Tiers with zero items hidden entirely (no empty tier headers)
- [ ] Loading skeleton while data fetches
- [ ] Page title: "Warranties"

## Notes

Tier calculation and sorting happen server-side — the API returns items pre-sorted with a `tier` field. The client groups by tier and renders sections in the defined order. Tier thresholds (30/60/90) are not configurable in the UI but are constants that can be adjusted if needed.
