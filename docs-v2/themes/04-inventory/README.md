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

## Epics

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Schema & Data Model](epics/00-schema-data-model.md) | Location tree, connections junction table, asset IDs, photos, notes | Done |
| 1 | [App Package & CRUD UI](epics/01-app-package-crud-ui.md) | `@pops/app-inventory` — list/grid views, detail page, create/edit forms, photo gallery | Done |
| 2 | [Location Tree Management](epics/02-location-tree-management.md) | Hierarchical browser, CRUD operations, item browsing per location | Done |
| 3 | [Connections & Graph](epics/03-connections-graph.md) | Bidirectional links, connection chain tracing, graph visualisation | Done |
| 4 | [Paperless-ngx Integration](epics/04-paperless-integration.md) | Document search, linking receipts/warranties/manuals, thumbnail display | Done |
| 5 | [Warranty, Value & Reporting](epics/05-warranty-value-reporting.md) | Warranty alerts, asset value dashboard, room-level reports, insurance exports | Done |

Epic 0 prerequisite to everything. Epic 1 after 0. Epics 2-5 parallel after 1.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location model | Self-referential tree (`parent_id`) | Arbitrary depth, multiple roots |
| Connections | Untyped bidirectional junction table | Item metadata carries semantic meaning, no connection types needed |
| Asset IDs | First-class unique text field | Human-readable prefixes (HDMI01, ETHER04) for physical identification |
| Photos | Local filesystem, compressed on upload | Max 1920px, ~500 MB budget |
| Borrowed items | Location-based ("Friend X" as root) | Handles 80% case, proper lending system is future |
| Notes | Free-form text, rendered as markdown | Rich specs per item |
| Paperless-ngx | Read-only (search + link) | No upload from POPS |

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
