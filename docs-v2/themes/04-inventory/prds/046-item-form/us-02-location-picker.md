# US-02: Location picker

> PRD: [046 — Item Create/Edit Form](README.md)
> Status: Partial

## Description

As a user, I want a location picker that shows my location hierarchy as a browsable tree so that I can assign an item to the correct location or quickly create a new one without leaving the form.

## Acceptance Criteria

- [x] Location picker trigger button displays the current selection as a breadcrumb (e.g., "Home > Bedroom > Wardrobe")
- [x] When no location is selected, the trigger button shows placeholder text (e.g., "Select location")
- [x] Clicking the trigger opens an overlay/modal with the full location tree
- [x] Location tree is fetched from `inventory.locations.getTree` and displayed with expand/collapse for each parent node
- [x] Tree nodes show location name and item count
- [x] Clicking a tree node selects that location, closes the overlay, and updates the trigger button breadcrumb
- [x] Search input within the overlay filters locations by name (client-side filter)
- [x] "Add Location" button within the overlay opens an inline form: name input + optional parent select
- [x] Inline quick-add calls `inventory.locations.create`, adds the new location to the tree, and selects it
- [x] Quick-add supports creating root locations (no parent) or child locations (parent selected)
- [x] A "Clear" option allows deselecting the current location (set to null)
- [x] Overlay can be closed without selecting (Escape key, click outside, close button)
- [x] When the location tree is empty, the overlay shows "No locations — create one" with the quick-add form
- [ ] Tests cover: trigger breadcrumb display, tree rendering with expand/collapse, node selection, search filtering, quick-add location creation, clear selection, empty tree state, overlay close without selection
- [ ] LocationPicker component NOT integrated into ItemFormPage — form uses plain text room field instead

## Notes

The location picker is a standalone component that receives the current locationId and an onChange callback. It manages its own tree state and API calls. The quick-add feature saves the user from navigating to a separate location management page — it creates the location and immediately selects it. The tree data should be cached and refreshed when a new location is created via quick-add.
