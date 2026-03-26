# US-01: Table view

> PRD: [044 — Items List Page](README.md)
> Status: Partial — missing Purchase Date column; Location shows plain text not breadcrumb; condition names differ (Excellent not New); no URL sort params

## Description

As a user, I want a table view of my inventory items with sortable columns so that I can see item details at a glance and sort by different criteria.

## Acceptance Criteria

- [ ] Table renders columns: Name, Asset ID, Type, Location (as breadcrumb), Condition (as colour-coded badge), Purchase Date, Replacement Value
- [x] Columns are sortable: Name (A-Z/Z-A), Type (A-Z/Z-A), Replacement Value (high/low), Purchase Date (newest/oldest)
- [x] Default sort is Name ASC
- [x] Clicking a column header toggles sort direction; active sort column is visually indicated
- [x] Clicking a row navigates to `/inventory/items/:id`
- [ ] Condition column renders badges: "new" (blue), "good" (green), "fair" (yellow), "poor" (orange), "broken" (red)
- [ ] Location column shows breadcrumb path (e.g., "Home > Living Room > TV Unit"); truncated with ellipsis if long, full path in tooltip
- [x] Asset ID column shows the ID or a dash if null
- [x] Replacement Value column formats as currency; shows dash if null
- [ ] Purchase Date column formats as locale date; shows dash if null
- [x] Pagination controls below the table with page size selector and page navigation
- [x] Table calls `inventory.items.list` with current sort, filters, page, and page size
- [ ] Tests cover: column rendering, sort toggle per column, row click navigation, badge colour mapping, breadcrumb truncation, null field handling, pagination

## Notes

Use the shared DataTable component from `@pops/ui` if available. Condition badges should use semantic colours consistent with the design token system. Sort state should be part of the URL query parameters so the table state is preserved on navigation.
