# Epic 01: App Package & CRUD UI

> Theme: [Inventory](../README.md)

## Scope

Build `@pops/app-inventory` — the workspace package with core inventory pages. List/grid view of all items, item detail page, and create/edit forms with location picker and photo upload.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 044 | [Items List Page](../prds/044-items-list-page/README.md) | Grid/table view of all items, filtering (type, location, condition), search by name and asset ID, view toggle | Done |
| 045 | [Item Detail Page](../prds/045-item-detail-page/README.md) | Item metadata display, photo gallery, connections list, linked documents, purchase transaction link, location breadcrumb | Done |
| 046 | [Item Create/Edit Form](../prds/046-item-form/README.md) | Dual-mode form (create/edit), location picker, photo upload with compression, asset ID generation, markdown notes | Done |

PRD-044 can be built independently. PRD-045 and PRD-046 can be built in parallel.

## Dependencies

- **Requires:** Epic 00 (schema and API must exist)
- **Unlocks:** Epics 02-05 (all add features to these pages)

## Out of Scope

- Location tree management UI (Epic 02)
- Connection management UI (Epic 03)
- Document linking (Epic 04)
