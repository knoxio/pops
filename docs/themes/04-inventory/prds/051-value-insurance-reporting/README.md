# PRD-051: Value & Insurance Reporting

> Epic: [05 — Warranty, Value & Reporting](../../epics/05-warranty-value-reporting.md)
> Status: Partial

## Overview

Build a total asset value dashboard, value breakdowns by location and type, and an insurance-ready report with items, values, photos, and linked receipts. Printable via browser print-to-PDF.

## Route

`/inventory/report`

## Dashboard Widgets

All widgets powered by a single aggregation API call (no N+1 queries):

- **Total replacement value:** sum of `replacementValue` across all items
- **Total resale value:** sum of `resaleValue` across all items
- **Total item count:** count of all items
- **Warranties expiring within 90 days:** count + link to warranties page (`/inventory/warranties`)
- **Recently added items:** last 5 items, compact layout (name, type, date added)

## Value Breakdowns

- **By location** (room level): bar chart or table showing total replacement value per location
- **By type:** same pattern — total replacement value per item type
- Click a location or type row to navigate to the items list filtered by that location/type
- Items with no location grouped under "Unassigned"
- Items with no replacement value excluded from value totals (included in count)

## Insurance Report Generator

- **Location selector:** dropdown — specific location or "Full Inventory"
- **"Include sub-locations" toggle** (when a specific location selected)
- **Sort by:** value (high first), name, type
- **Per-item details:** name, brand, model, asset ID, condition, purchase date, warranty status (active/expired/none), replacement value, resale value, primary photo, linked receipt document IDs
- **Summary section:** total replacement value, total resale value, item count for the selected scope

## Printable Report

- `@media print` CSS for clean print layout
- Browser native print-to-PDF (no server-side generation)
- One page-break per location section (when printing full inventory)
- Photos sized for print (max 200px width, reasonable file size)
- Report header: "POPS Inventory Report — [location or Full Inventory] — [date]"
- Dashboard widgets and breakdowns hidden in print — only the item report prints

## API Surface

| Procedure                              | Input                                  | Output                                                                                    | Notes                                               |
| -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `inventory.report.dashboard`           | (none)                                 | `{ totalReplacementValue, totalResaleValue, itemCount, expiringWarranties, recentItems }` | Single aggregation query                            |
| `inventory.report.breakdownByLocation` | (none)                                 | `{ data: { locationId, locationName, totalValue, itemCount }[] }`                         | Grouped by location                                 |
| `inventory.report.breakdownByType`     | (none)                                 | `{ data: { type, totalValue, itemCount }[] }`                                             | Grouped by type                                     |
| `inventory.report.generate`            | locationId?, includeChildren?, sortBy? | `{ data: ReportItem[], summary }`                                                         | Fully hydrated items with photos and document links |

## Business Rules

- Dashboard aggregation runs as a single SQL query with subqueries — no N+1
- Value breakdowns use `replacementValue` — items with null replacement value appear in counts but not value sums
- Report generator accepts optional `locationId` — null means full inventory
- `includeChildren` uses recursive CTE for descendant locations (same pattern as PRD-047 US-04)
- Photos included in report are the primary photo for each item (first photo if multiple exist)
- Receipt document IDs reference Paperless documents (PRD-049) — shown as IDs in the report, not thumbnails (print-friendly)

## Edge Cases

| Case                                             | Behaviour                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| No items in inventory                            | Dashboard shows all zeros; report shows empty state                                      |
| Items with no replacement value                  | Included in counts, excluded from value sums — value shows "—"                           |
| Items with no photos                             | Photo column blank in report                                                             |
| No receipts linked                               | Receipt column blank in report                                                           |
| Location with no items (but children have items) | Location row in breakdown shows 0 direct items; include sub-locations shows child totals |
| Print with very large inventory                  | CSS page-breaks per location section prevent single-page overflow                        |

## User Stories

| #   | Story                                                 | Summary                                                                                                         | Status  | Parallelisable            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | ------------------------- |
| 01  | [us-01-dashboard-widgets](us-01-dashboard-widgets.md) | Dashboard with total replacement/resale values, item count, expiring warranties, recent items (single API call) | Done    | No (first)                |
| 02  | [us-02-value-breakdowns](us-02-value-breakdowns.md)   | Value breakdowns by location and type, click to navigate to filtered list                                       | Done    | Yes (parallel with us-01) |
| 03  | [us-03-insurance-report](us-03-insurance-report.md)   | Report generator with location selector, include sub-locations, per-item details, summary                       | Partial | Blocked by us-01          |
| 04  | [us-04-print-layout](us-04-print-layout.md)           | @media print CSS, browser print-to-PDF, location sections, print-friendly photo sizing                          | Partial | Blocked by us-03          |

US-01 and US-02 can parallelise. US-03 blocked by us-01. US-04 blocked by us-03.

## Out of Scope

- Server-side PDF generation
- Insurance claim submission workflow
- Depreciation calculations
- Historical value tracking over time
- Export to CSV or spreadsheet format

## Drift Check

last checked: 2026-04-17
