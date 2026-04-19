# PRD-044: Items List Page

> Epic: [01 — App Package & CRUD UI](../../epics/01-app-package-crud-ui.md)
> Status: Done

## Overview

Build the inventory items list — a dual-mode view (table and grid) of all inventory items. Filter by type, location, and condition. Search by name and asset ID, with exact asset ID match navigating directly to the item detail page. This is the entry point to the inventory app and the default route.

## Routes

| Route        | Page                 |
| ------------ | -------------------- |
| `/inventory` | Items list (default) |

## UI Components

### Table View

| Element          | Detail                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Columns          | Name, Asset ID, Type, Location (breadcrumb), Condition (badge), Purchase Date, Replacement Value |
| Sortable columns | Name, Type, Replacement Value, Purchase Date                                                     |
| Row click        | Navigates to `/inventory/items/:id`                                                              |

### Grid View

| Element            | Detail                                                               |
| ------------------ | -------------------------------------------------------------------- |
| Card content       | Primary photo (or placeholder), name, asset ID, type badge, location |
| Responsive columns | 2 (mobile) → 3 (tablet) → 4-5 (desktop)                              |
| Card click         | Navigates to `/inventory/items/:id`                                  |

### Filters and Controls

| Element          | Detail                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Search input     | Filters by name (LIKE) and asset ID; exact asset ID match navigates directly to item detail |
| Type select      | Dropdown populated from distinct types in items                                             |
| Location select  | Dropdown with flat or tree hierarchy                                                        |
| Condition select | Options: new, good, fair, poor, broken                                                      |
| View toggle      | Table/Grid toggle, adjacent to the data (same row as search/filters, not in page header)    |

## API Dependencies

| Procedure                         | Usage                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| `inventory.items.list`            | Fetch paginated items with search, type, location, condition filters |
| `inventory.items.searchByAssetId` | Check for exact asset ID match on search submit                      |

## Business Rules

- Items list is the default inventory route — `/inventory` renders this page
- Search filters by name (LIKE match) and also checks for an exact asset ID match
- If the search term exactly matches an asset ID, navigate directly to that item's detail page instead of showing filtered results
- View toggle state (table/grid) is persisted in localStorage
- Type select is dynamically populated from the distinct types present in the items table
- All filter and sort state is persisted in URL query parameters
- Empty library shows a call-to-action: "No items yet — Add your first item" with a link to the create form

## Edge Cases

| Case                               | Behaviour                                               |
| ---------------------------------- | ------------------------------------------------------- |
| No items exist                     | Empty state with CTA linking to create form             |
| Search matches an asset ID exactly | Navigate directly to item detail page                   |
| Search matches asset ID and name   | Asset ID match takes precedence — navigate to detail    |
| Filters return no results          | "No items match your filters" with clear filters button |
| Location with long breadcrumb      | Full path in tooltip                                    |
| Item has no photo (grid view)      | Placeholder icon displayed in card                      |

## User Stories

| #   | Story                                           | Summary                                                                           | Status | Parallelisable |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ------ | -------------- |
| 01  | [us-01-table-view](us-01-table-view.md)         | DataTable with sortable columns, row click navigation                             | Done   | Yes            |
| 02  | [us-02-grid-view](us-02-grid-view.md)           | Responsive card grid with photo/metadata, view toggle persisted in localStorage   | Done   | Yes            |
| 03  | [us-03-filters-search](us-03-filters-search.md) | Search input with asset ID redirect, type/location/condition selects, empty state | Done   | Yes            |

All three stories can be built in parallel. US-01 and US-02 are independent view modes. US-03 provides filtering that applies to both views.

## Out of Scope

- Item detail view (PRD-045)
- Item create/edit form (PRD-046)
- Location tree management (Epic 02)
- Connection graph visualisation (Epic 03)
- Warranty alerts in list view (Epic 05)

## Drift Check

last checked: 2026-04-18
