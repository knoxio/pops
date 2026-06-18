# US-02: Value breakdowns

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Done

## Description

As a user, I want to see asset value broken down by location and type so that I can understand where my value is concentrated.

## Acceptance Criteria

- [x] "Value by Location" section on the report page — fetched via `inventory.reports.valueByLocation`
- [x] Each location row shows: location name, total replacement value (formatted as currency), item count
- [x] Rows sorted by total value descending (highest value location first)
- [x] Items with no location grouped under "Unassigned"
- [x] Clicking a location row navigates to the items list filtered by that location
- [x] "Value by Type" section — fetched via `inventory.reports.valueByType`
- [x] Each type row shows: type name, total replacement value (formatted as currency), item count
- [x] Rows sorted by total value descending
- [x] Clicking a type row navigates to the items list filtered by that type
- [x] Both sections render a horizontal bar chart (each row shows name, value bar, currency total, and item count)
- [x] Loading skeleton for each section while data fetches
- [x] Empty section: "No items with replacement values" when no items have `replacementValue` set
- [x] Locations/types with items but no replacement values show count only, value as "—"

## Notes

Breakdowns use `replacementValue` for the value column. Items with null `replacementValue` still appear in the item count but contribute $0 to the value sum. The bar chart is optional — a clean table is sufficient for the initial implementation. The breakdowns sit below the dashboard widgets on the same page.
