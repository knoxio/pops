# US-03: Filters, search, and empty state

> PRD: [044 — Items List Page](README.md)
> Status: Partial

## Description

As a user, I want to filter inventory items by type, location, and condition, search by name or asset ID, and see a helpful empty state so that I can find items quickly or get started when my inventory is empty.

## Acceptance Criteria

- [x] Search input filters items by name (LIKE match, debounced at 300ms)
- [ ] On search submit (Enter key), check for exact asset ID match via `inventory.items.searchByAssetId`; if found, navigate directly to `/inventory/items/:id`
- [ ] If search term matches an asset ID, asset ID navigation takes precedence over name filtering
- [ ] Type select dropdown populated dynamically from distinct item types in the database
- [ ] Location select dropdown shows location hierarchy (indented or breadcrumb style)
- [x] Condition select dropdown with options: All (default), New, Good, Fair, Poor, Broken
- [ ] All filter values are persisted as URL query parameters (`?q=`, `?type=`, `?location=`, `?condition=`)
- [x] Changing any filter re-fetches the items list and resets pagination to page 1
- [x] "Clear filters" button appears when any filter is active; clicking it resets all filters
- [ ] Empty state (no items in database): "No items yet — Add your first item" with link to `/inventory/items/new`
- [x] No-results state (filters active but no matches): "No items match your filters" with "Clear filters" button
- [ ] Tests cover: search debounce, asset ID redirect on Enter, type/location/condition filter application, query parameter persistence, clear filters reset, empty state rendering, no-results state rendering

## Notes

The asset ID redirect behaviour is the key differentiator for search — it lets users type an asset ID (e.g., "HDMI01") and jump straight to that item. The search input should give visual feedback when performing the asset ID lookup (brief loading indicator on submit). Filter state in URL params makes the page bookmarkable and supports browser back/forward.
