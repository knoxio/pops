# Epic 02: Location Tree Management

> Theme: [Inventory](../README.md)

## Scope

Build the location tree management UI — hierarchical browser for creating, editing, reordering, and deleting locations. Browse items per location. Supports arbitrary depth with multiple root locations (Home, Car, Storage Cage).

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 047 | [Location Tree Management](../prds/047-location-tree-management/README.md) | Tree browser, CRUD operations, drag-and-drop reordering, circular reference prevention, item browsing per location, mobile fallback for drag-and-drop | Partial |

## Dependencies

- **Requires:** Epic 01 (items and locations must have basic CRUD)
- **Unlocks:** Richer location browsing and organisation

## Out of Scope

- Location creation during item edit (that's in Epic 01's form)
- AI-assisted location path creation (future enhancement)
