# US-01: Item metadata and layout

> PRD: [045 — Item Detail Page](README.md)
> Status: Partial

## Description

As a user, I want to see all metadata for an inventory item on a single page — including name, asset ID, condition, brand, model, type, purchase details, location breadcrumb, notes, and purchase links — so that I have a complete view of the item without navigating elsewhere.

## Acceptance Criteria

- [x] Page renders at `/inventory/items/:id`
- [x] Header displays item name as a large heading
- [x] Asset ID badge renders next to the name when present; omitted when null
- [x] Condition badge renders with semantic colour: new (blue), good (green), fair (yellow), poor (orange), broken (red)
- [x] Edit button navigates to `/inventory/items/:id/edit`
- [ ] Delete button opens a confirmation modal: "Delete ITEM_NAME? This will also remove X connections and Y photos." — button calls delete directly, no modal
- [ ] Confirming delete calls `inventory.items.delete`, then navigates to `/inventory` — no modal confirmation step
- [ ] Cancelling delete closes the modal with no action — no modal
- [x] Metadata section displays key-value pairs: Brand, Model, Type, Purchase Date, Purchase Price, Replacement Value, Resale Value
- [x] Metadata fields with null values are omitted entirely (not shown as "N/A" or dashes)
- [x] Currency values (Purchase Price, Replacement Value, Resale Value) are formatted as locale currency
- [x] Date values (Purchase Date) are formatted as locale dates
- [ ] Location breadcrumb renders as "Home > Living Room > TV Unit" with each segment clickable — not implemented
- [ ] Clicking a breadcrumb segment navigates to `/inventory?location=:locationId` — not implemented
- [ ] When locationId is null, breadcrumb area shows "No location assigned" — not implemented
- [ ] Notes section renders markdown content (sanitised to prevent XSS) — rendered as plain text
- [x] Notes section is hidden when notes is null or empty
- [ ] Purchase link section shows link to finance transaction when purchaseTransactionId is set — not implemented
- [ ] Purchase link section shows entity name when purchasedFromId is set — not implemented
- [ ] Purchase link section is hidden when both fields are null — section entirely absent
- [x] 404 page renders when item ID does not exist
- [ ] Tests cover: metadata rendering with all fields, metadata rendering with null fields, breadcrumb rendering and navigation, delete modal with counts, notes markdown rendering, purchase link visibility, 404 case — no tests

## Notes

The `inventory.items.get` response includes the location breadcrumb, connection count, and photo count — use these for the breadcrumb display and the delete confirmation message. Notes markdown rendering should use a sanitising markdown library to prevent script injection.
