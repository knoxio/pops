# US-03: Warranty empty states

> PRD: [050 — Warranty Tracking](README.md)
> Status: Done

## Description

As a user, I want clear messaging when there are no warranties to track so that I understand the page is working correctly and know what to do next.

## Acceptance Criteria

- [x] Page-level empty state when no items have `warrantyExpiry` set: "No warranties tracked — add warranty dates to your items"
- [x] Page-level empty state includes a call-to-action: "Browse Items" link navigating to the items list
- [x] Empty state only shown when the API returns zero items — not shown while loading
- [x] When all warranties are expired: Expired tier shown expanded (overrides default collapsed state since it's the only tier)
- [x] When only one tier has items: that tier shown, all others hidden — no "No items in this tier" messages
- [x] Error state if API call fails: "Could not load warranties — try again" with retry button
- [x] Retry button re-fetches `inventory.reports.warranties`

## Notes

Empty states are intentionally minimal. The page either has warranty items to show or it has a single helpful message pointing the user toward adding warranty dates. Per-tier empty messages are not needed because empty tiers are hidden entirely (US-01).
