# Epic 05: Warranty, Value & Reporting

> Theme: [Inventory](../README.md)

## Scope

Build warranty tracking and asset value reporting. Surface items approaching warranty expiry with urgency tiers. Generate insurance-ready reports with item lists, replacement values, photos, and linked receipts — filterable by room, type, or any combination.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 050 | [Warranty Tracking](../prds/050-warranty-tracking/README.md) | Warranties page with urgency tiers (expired, expiring soon, active), warranty alerts, expiry date tracking | Done |
| 051 | [Value & Insurance Reporting](../prds/051-value-insurance-reporting/README.md) | Total asset value dashboard, value breakdown by room/type, insurance-ready report with items, values, photos, receipts | Done |

PRD-050 and PRD-051 can be built in parallel.

## Dependencies

- **Requires:** Epic 01 (items with warranty dates and replacement values), Epic 04 (linked receipts appear in reports)
- **Unlocks:** "What's in the bedroom and what's it worth?" in one click

## Out of Scope

- Insurance claim submission workflow
- Depreciation calculations
- Automated warranty date extraction from receipts
