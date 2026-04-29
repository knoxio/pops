# US-01: Dashboard widgets

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Done

## Description

As a user, I want a reporting dashboard showing total asset values, item count, and warranty status so that I can see my inventory's financial summary at a glance.

## Acceptance Criteria

- [x] Page at `/inventory/reports` — accessible from inventory navigation
- [x] Dashboard fetches all widget data via `inventory.reports.dashboard` (single API call)
- [x] Widget: Total replacement value — formatted as currency (e.g., "$12,450")
- [x] Widget: Total resale value — formatted as currency
- [x] Widget: Total item count — plain number
- [x] Widget: Warranties expiring within 90 days — count displayed, clicking navigates to `/inventory/warranties`
- [x] Widget: Recently added items — last 5 items, each showing name, type badge, date added
- [x] Recently added items: clicking an item navigates to its detail page
- [x] Widgets laid out in a responsive grid: 2×2 stat grid on desktop, single column on mobile; recently added and value-by-type span full width below
- [x] Loading skeleton for each widget while data fetches
- [x] Empty state when inventory is empty: all values show "$0", count shows "0", recent items shows "No items yet"
- [x] Values that are null/undefined treated as 0 in sums

## Notes

The single API call uses aggregation subqueries — `SUM(replacementValue)`, `SUM(resaleValue)`, `COUNT(*)`, a count with warranty expiry filter, and a limited select for recent items. Items with null `replacementValue` or `resaleValue` are excluded from their respective sums (SQL `SUM` ignores nulls by default).
