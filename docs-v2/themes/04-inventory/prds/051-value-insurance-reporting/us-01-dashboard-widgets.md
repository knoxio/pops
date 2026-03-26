# US-01: Dashboard widgets

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Partial

## Description

As a user, I want a reporting dashboard showing total asset values, item count, and warranty status so that I can see my inventory's financial summary at a glance.

## Acceptance Criteria

- [ ] Page at `/inventory/report` — accessible from inventory navigation — dashboard currently at `/inventory`, not `/inventory/report`
- [x] Dashboard fetches all widget data via `inventory.report.dashboard` (single API call)
- [x] Widget: Total replacement value — formatted as currency (e.g., "$12,450.00")
- [x] Widget: Total resale value — formatted as currency
- [x] Widget: Total item count — plain number
- [ ] Widget: Warranties expiring within 90 days — count displayed, clicking navigates to `/inventory/warranties` — count shown but no click handler
- [x] Widget: Recently added items — last 5 items, each showing name, type badge, date added
- [x] Recently added items: clicking an item navigates to its detail page
- [x] Widgets laid out in a responsive grid: 2x2 on desktop with recent items spanning full width below, stacked on mobile
- [x] Loading skeleton for each widget while data fetches
- [ ] Empty state when inventory is empty: all values show "$0.00", count shows "0", recent items shows "No items yet" — empty state not verified
- [x] Values that are null/undefined treated as 0 in sums

## Notes

The single API call uses aggregation subqueries — `SUM(replacementValue)`, `SUM(resaleValue)`, `COUNT(*)`, a count with warranty expiry filter, and a limited select for recent items. Items with null `replacementValue` or `resaleValue` are excluded from their respective sums (SQL `SUM` ignores nulls by default).
