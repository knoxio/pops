# US-07b: Inventory items result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want inventory search results to show asset ID badge, item name, location, and type so I can find physical items quickly.

## Acceptance Criteria

- [ ] `InventoryItemsResultComponent` registered in frontend registry for domain `"inventory-items"`
- [ ] Renders: asset ID badge (monospace, prominent) + item name + location breadcrumb + type
- [ ] Asset ID badge styled distinctly (code font, subtle background)
- [ ] Highlights matched portion using `query` prop + `matchField`/`matchType`
- [ ] Renders gracefully when optional fields are null (no assetId, no location)
- [ ] Tests: renders with all fields, renders with null optionals, highlighting works

## Notes

Component lives in `packages/app-inventory/`. Depends on US-07 for hit data shape.
