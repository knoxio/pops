# US-02: Value breakdowns

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: To Review

## Description

As a user, I want to see asset value broken down by location and type so that I can understand where my value is concentrated.

## Acceptance Criteria

- [ ] "Value by Location" section on the report page — fetched via `inventory.report.breakdownByLocation`
- [ ] Each location row shows: location name, total replacement value (formatted as currency), item count
- [ ] Rows sorted by total value descending (highest value location first)
- [ ] Items with no location grouped under "Unassigned"
- [ ] Clicking a location row navigates to the items list filtered by that location
- [ ] "Value by Type" section — fetched via `inventory.report.breakdownByType`
- [ ] Each type row shows: type name, total replacement value (formatted as currency), item count
- [ ] Rows sorted by total value descending
- [ ] Clicking a type row navigates to the items list filtered by that type
- [ ] Both sections support bar chart or table display (table is the default; bar chart is a progressive enhancement)
- [ ] Loading skeleton for each section while data fetches
- [ ] Empty section: "No items with replacement values" when no items have `replacementValue` set
- [ ] Locations/types with items but no replacement values show count only, value as "—"

## Notes

Breakdowns use `replacementValue` for the value column. Items with null `replacementValue` still appear in the item count but contribute $0 to the value sum. The bar chart is optional — a clean table is sufficient for the initial implementation. The breakdowns sit below the dashboard widgets on the same page.
