# US-03: Insurance report generator

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Done

## Description

As a user, I want to generate an insurance-ready inventory report filtered by location so that I can provide a detailed item list with values and receipts for insurance purposes.

## Acceptance Criteria

- [x] "Generate Report" section on the report page, below the dashboard and breakdowns
- [x] Location selector dropdown: lists all locations + "Full Inventory" option (default) via `LocationPicker`
- [x] "Include sub-locations" toggle — visible only when a specific location is selected
- [x] Sort selector: "Value (high first)" (default), "Name", "Type"
- [x] "Generate" button fetches data via `inventory.report.generate` with selected filters
- [x] Report renders below the controls after generation
- [x] Report header: "POPS Inventory Report — [location name or Full Inventory] — [formatted date]"
- [x] Per-item row shows: name, brand, model, asset ID, condition, purchase date (formatted), warranty status ("Active — expires [date]" / "Expired" / "No warranty"), replacement value, resale value
- [x] Per-item row includes: primary photo (first photo for the item, or placeholder if none)
- [x] Per-item row includes: linked receipt document IDs (as plain text list, e.g., "#1234, #5678")
- [x] Summary section at the bottom: total replacement value, total resale value, item count
- [x] Items with no replacement value show "—" in the value column
- [x] Loading state while report generates
- [x] Empty result: "No items found for the selected location"
- [x] "Print Report" button triggers `window.print()` — print layout handled by US-04

## Notes

The report generator uses the same `includeChildren` recursive CTE pattern as PRD-047 US-04. Receipt document IDs come from `item_documents` with tag "receipt". Photos are the item's primary photo — if an item has multiple photos, use the first one. The "Print Report" button is non-functional until US-04 implements the print CSS.
