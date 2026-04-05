# US-07b: Inventory items result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want inventory search results to show item name, brand, location, and value so I can find physical items quickly.

## Acceptance Criteria

- [x] `InventoryItemsResultComponent` registered in frontend registry for domain `"inventory-items"`
- [x] Renders: item name + brand + location breadcrumb + replacement value
- [x] Highlights matched portion using `query` prop + `matchField`/`matchType`
- [x] Renders gracefully when optional fields are null (no brand, no location, no value)
- [x] Tests: renders with all fields, renders with null optionals, highlighting works

## Notes

Component lives in `packages/app-inventory/`. Depends on US-07 for hit data shape.
