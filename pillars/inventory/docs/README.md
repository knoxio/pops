# Theme: Inventory

> Know what I own, where it is, and what it's connected to.

## Strategic Objective

Build a home inventory app that tracks every physical item — from a $5,000 MacBook to a $3 HDMI cable — with photos, specs, warranty dates, purchase links, and receipt attachments. The core model is a physical connectivity graph on a hierarchical location tree. The system answers "where is it?", "is it under warranty?", "what's plugged into this power board?", and "what's the total replacement value?" without thinking.

## Success Criteria

- Full CRUD for items with rich metadata (brand, model, condition, purchase date, warranty, replacement value, notes)
- Bidirectional item connections track physical links (cables to devices, power supplies to power boards)
- Location tree supports arbitrary depth with multiple roots (Home, Car, Storage Cage)
- Custom asset IDs (HDMI01, ROUTER01) are first-class searchable identifiers
- Photos uploadable and viewable per item
- Receipts/warranties link to Paperless-ngx documents
- Purchase transactions and entities link items to the finance domain
- Warranty expiry alerts surface proactively
- Connection chain tracing from wall outlet to devices
- Insurance-ready reports with item list, values, photos, and receipts

## PRD Index

### Schema & Data Model

The inventory domain schema: items with rich metadata on a hierarchical location tree, bidirectional item connections, photos, and human-readable asset IDs. This is the foundation every other inventory feature builds on.

| PRD                                                  | Summary                                                                                                                       | Status  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| [Inventory Data Model & API](prds/data-model-api.md) | Items table, locations tree (self-referential parent_id), connections junction table, photos, asset IDs, notes, REST contract | Partial |

### App Package & CRUD UI

The inventory app's core pages: browse every item, inspect one in full, and create or edit items with a location picker and photo upload.

| PRD                                          | Summary                                                                                                                      | Status |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Items List Page](prds/items-list-page.md)   | Grid/table view of all items, filtering (type, location, condition), search by name and asset ID, view toggle, value summary | Done   |
| [Item Detail Page](prds/item-detail-page.md) | Item metadata display, photo gallery, connections list, linked documents, purchase transaction link, location breadcrumb     | Done   |
| [Item Create/Edit Form](prds/item-form.md)   | Dual-mode form (create/edit), location picker, photo upload with compression, asset ID generation, markdown notes            | Done   |

### Location Tree Management

A hierarchical location manager: arbitrary-depth tree with multiple roots (Home, Car, Storage Cage), full CRUD, reparenting, and item browsing per location.

| PRD                                                          | Summary                                                                                                                                               | Status  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [Location Tree Management](prds/location-tree-management.md) | Tree browser, CRUD operations, drag-and-drop reordering, circular reference prevention, item browsing per location, mobile fallback for drag-and-drop | Partial |

### Connections & Graph

Bidirectional item-to-item connections and chain tracing: one connection row links two items and both see it. Trace from a wall outlet through power boards to every connected device, with an optional force-directed graph view.

| PRD                                              | Summary                                                                                                | Status |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| [Connections & Graph](prds/connections-graph.md) | Connect dialog, connections list on detail page, chain tracing with recursive CTE, graph visualisation | Done   |

### Paperless-ngx Integration

Link Paperless-ngx documents (receipts, warranties, manuals) to inventory items. POPS stores only the link, never document content; the feature is opt-in and invisible without its env config.

| PRD                                                        | Summary                                                                                                         | Status |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| [Paperless-ngx Integration](prds/paperless-integration.md) | Document search modal, linking with tags, thumbnail display, graceful degradation when Paperless is unavailable | Done   |

### Warranty, Value & Reporting

Warranty tracking and asset-value reporting: surface items approaching warranty expiry with urgency tiers, and generate insurance-ready reports with item lists, replacement values, photos, and linked receipts.

| PRD                                                              | Summary                                                                                                                | Status |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| [Warranty Tracking](prds/warranty-tracking.md)                   | Warranties page with urgency tiers (expired, expiring soon, active), warranty alerts, expiry date tracking             | Done   |
| [Value & Insurance Reporting](prds/value-insurance-reporting.md) | Total asset value dashboard, value breakdown by room/type, insurance-ready report with items, values, photos, receipts | Done   |

### Fixtures & MCP Interface

Expose the inventory domain to Claude via MCP write tools, and model fixtures — house infrastructure (outlets, panels, ports) that items connect to but the user does not own. Together these let a user dictate locations, items, and connections by conversation, no UI required.

| PRD                                                | Summary                                                       | Status  |
| -------------------------------------------------- | ------------------------------------------------------------- | ------- |
| [Inventory MCP Write Tools](prds/mcp-write.md)     | MCP mutations for locations, items, and item-item connections | Done    |
| [Fixtures Data Model](prds/fixtures-data-model.md) | `fixtures` table, `item_fixture_connections` table, REST API  | Partial |

Fixture CRUD and item-fixture connection MCP tools live in the platform pillar's [MCP Server](../../../docs/themes/platform/prds/mcp-server.md) PRD, built on the fixtures REST contract above.

## Key Decisions

| Decision       | Choice                                 | Rationale                                                             |
| -------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Location model | Self-referential tree (`parent_id`)    | Arbitrary depth, multiple roots                                       |
| Connections    | Untyped bidirectional junction table   | Item metadata carries semantic meaning, no connection types needed    |
| Asset IDs      | First-class unique text field          | Human-readable prefixes (HDMI01, ETHER04) for physical identification |
| Photos         | Local filesystem, compressed on upload | Max 1920px, ~500 MB budget                                            |
| Borrowed items | Location-based ("Friend X" as root)    | Handles 80% case, proper lending system is future                     |
| Notes          | Free-form text, rendered as markdown   | Rich specs per item                                                   |
| Paperless-ngx  | Read-only (search + link)              | No upload from POPS                                                   |

## Risks

- **Location tree setup effort** — Initial 4-5 level deep tree is tedious. Mitigation: seed from imports, incremental after that
- **Connection graph complexity** — 100+ items gets visually overwhelming. Mitigation: flat list is MVP, graph is stretch goal
- **Paperless-ngx API stability** — Community project. Mitigation: isolate behind service interface
- **Scope creep toward asset management** — This is personal inventory, not enterprise CMDB

## Out of Scope

- Barcode/QR code scanning
- Depreciation or financial asset tracking (finance domain)
- Lending/borrowing system with reminders
- Automated item discovery (network scanning)
- Insurance claim submission
- Maintenance scheduling (separate theme)
- Connection types (power, data, audio)
