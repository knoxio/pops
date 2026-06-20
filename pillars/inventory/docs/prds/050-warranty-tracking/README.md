# PRD-050: Warranty Tracking

> Epic: [05 — Warranty, Value & Reporting](../../epics/05-warranty-value-reporting.md)
> Status: Done

## Overview

Build a warranties page with urgency tiers. Surface items approaching warranty expiry with colour-coded urgency. Group by status: expired, expiring soon (multiple tiers), active.

## Route

`/inventory/warranties`

## Urgency Tiers

| Tier                       | Condition                | Colour        | Default State                     |
| -------------------------- | ------------------------ | ------------- | --------------------------------- |
| Expiring Soon (<30 days)   | 0 < daysRemaining <= 30  | Red           | Always expanded                   |
| Expiring Soon (30-60 days) | 30 < daysRemaining <= 60 | Yellow/Orange | Always expanded                   |
| Expiring Soon (60-90 days) | 60 < daysRemaining <= 90 | Orange        | Always expanded                   |
| Active (>90 days)          | daysRemaining > 90       | Green         | Collapsible, expanded by default  |
| Expired                    | daysRemaining <= 0       | Grey/Muted    | Collapsible, collapsed by default |

Tiers calculated from `currentDate - item.warrantyExpiry`. Sorted within each tier by expiry date ascending (most urgent first).

## Item Row

Each item in any tier shows:

- Item name, asset ID, brand/model
- Warranty expiry date (formatted)
- Days remaining (e.g., "12 days left") or "Expired X days ago"
- Link to item detail page
- Link to warranty document (if linked via Paperless — uses `item_documents` with tag "warranty")

## API Surface

| Procedure                   | Input  | Output                     | Notes                                                                             |
| --------------------------- | ------ | -------------------------- | --------------------------------------------------------------------------------- |
| `inventory.warranties.list` | (none) | `{ data: WarrantyItem[] }` | All items with `warrantyExpiry` set, includes computed `daysRemaining` and `tier` |

The endpoint returns all items with warranty dates in a single call. Tier assignment and sorting happen server-side.

## Business Rules

- Only items with `warrantyExpiry` set appear on this page
- Items with no warranty date are excluded entirely
- Tiers calculated from current date vs `warrantyExpiry`
- "Days remaining" is `warrantyExpiry - today` in calendar days
- Expired items show negative days as "Expired X days ago"
- Warranty document link only appears if an `item_documents` row exists with tag "warranty" for that item

## Edge Cases

| Case                                            | Behaviour                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| No items with warranty dates                    | Empty state: "No warranties tracked — add warranty dates to your items" |
| All warranties expired                          | Only Expired tier shown (expanded since it's the only group)            |
| Warranty expires today                          | daysRemaining = 0, placed in "<30 days" tier                            |
| Tier has no items                               | Tier heading hidden                                                     |
| Item has warranty date but no warranty document | Row renders normally, warranty document link absent                     |

## User Stories

| #   | Story                                                         | Summary                                                                                       | Status | Parallelisable   |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-warranty-tiers](us-01-warranty-tiers.md)               | Warranty page with urgency tiers, colour coding, collapsible sections, sort by expiry         | Done   | No (first)       |
| 02  | [us-02-warranty-items](us-02-warranty-items.md)               | Item rows with name/assetId/brand/model, expiry date, days remaining, detail + document links | Done   | Blocked by us-01 |
| 03  | [us-03-warranty-empty-states](us-03-warranty-empty-states.md) | Page-level and per-tier empty states, edge case handling                                      | Done   | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01.

## Out of Scope

- Warranty expiry notifications or push alerts
- Automated warranty date extraction from receipts
- Extended warranty purchase tracking
- Depreciation calculations

## Drift Check

last checked: 2026-04-17
