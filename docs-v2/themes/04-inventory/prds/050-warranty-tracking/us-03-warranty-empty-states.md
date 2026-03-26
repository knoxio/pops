# US-03: Warranty empty states

> PRD: [050 — Warranty Tracking](README.md)
> Status: To Review

## Description

As a user, I want clear messaging when there are no warranties to track so that I understand the page is working correctly and know what to do next.

## Acceptance Criteria

- [ ] Page-level empty state when no items have `warrantyExpiry` set: "No warranties tracked — add warranty dates to your items"
- [ ] Page-level empty state includes a call-to-action: "Browse Items" link navigating to the items list
- [ ] Empty state only shown when the API returns zero items — not shown while loading
- [ ] When all warranties are expired: Expired tier shown expanded (overrides default collapsed state since it's the only tier)
- [ ] When only one tier has items: that tier shown, all others hidden — no "No items in this tier" messages
- [ ] Error state if API call fails: "Could not load warranties — try again" with retry button
- [ ] Retry button re-fetches `inventory.warranties.list`

## Notes

Empty states are intentionally minimal. The page either has warranty items to show or it has a single helpful message pointing the user toward adding warranty dates. Per-tier empty messages are not needed because empty tiers are hidden entirely (US-01).
