# Theme: Inventory

> Know what I own, where it is, and what it's connected to.

## Strategic Objective

Upgrade the home inventory from a read-only stub into the highest daily-use app in POPS. Replace the Notion inventory database as the source of truth. Track every item — from a $5,000 MacBook to a $3 HDMI cable — with photos, specs, warranty dates, purchase links, receipt attachments, and physical connections. The system should answer "where is it?", "is it under warranty?", "what cables does this device need?", "what's plugged into this power board?", and "what's the total replacement value?" without thinking.

The core model is a **physical connectivity graph on a hierarchical location tree**. Every item has a location (Home → Living Room → TV Unit → Left Door). Items connect to other items bidirectionally (HDMI02 ↔ TV, TV ↔ TOSLINK01, router ↔ ETHER04). You can trace from a wall power outlet through power boards and power supplies to see every device hanging off it. You can look at a cable's asset tag (HDMI01), search POPS, and instantly see where it is, what it's connected to, and whether it's in use.

The current POPS inventory is a read-only data table with 5 seeded items. The Notion inventory has the real data — dozens of items with rich metadata, photos, custom IDs, and item relationships. This theme brings POPS to parity with Notion, then surpasses it with proper connections, Paperless-ngx receipt linking, and a full CRUD UI.

## Success Criteria

- Every item currently in Notion is in POPS with full metadata, photos, and connections intact
- Items can be created, edited, and deleted from the UI — not just viewed in a read-only table
- Bidirectional item connections track physical links — cables to devices, power supplies to power boards, ethernet plugs across rooms
- Location tree supports arbitrary depth (Home → Room → Furniture → Shelf → Drawer) with multiple root locations (Home, Car, Storage Cage, Friend X)
- Custom asset IDs (HDMI01, ROUTER01, PB03) are first-class searchable identifiers
- Photos can be attached to items and viewed in the detail page
- Receipts link to Paperless-ngx documents for warranty claims and insurance
- Purchase transactions and entities link items to the finance domain
- Warranty expiry dates surface proactively — items approaching warranty end are flagged
- Tracing a connection chain from wall outlet → power board → devices is possible in the UI
- Total asset replacement value is always one click away — filterable by room, type, or any combination
- "What was in the bedroom and what's it worth?" produces an insurance-ready report with item list, values, photos, and receipts

## Epics (ordered by dependency)

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Schema Upgrade & Migration](epics/00-schema-upgrade.md) | Extend schema: location tree, connections junction table, asset IDs, photos, notes. Drizzle migration | Not started |
| 1 | [Notion Import](epics/01-notion-import.md) | One-time import of all Notion inventory data into POPS (items, photos, locations, relationships) | Not started |
| 2 | [App Package & Edit UI](epics/02-app-package-ui.md) | `@pops/app-inventory` workspace package, CRUD pages, detail views, photo gallery, location picker | Not started |
| 3 | [Connections & Graph](epics/03-connections-graph.md) | Bidirectional item connections, connection chain tracing, graph visualisation | Not started |
| 4 | [Paperless-ngx Integration](epics/04-paperless-integration.md) | Link receipts, warranties, and manuals from Paperless-ngx to inventory items | Not started |
| 5 | [Warranty, Value & Reporting](epics/05-warranty-value-reporting.md) | Warranty expiry alerts, total asset value dashboard, room-level value reports, insurance-ready exports | Not started |

Epic 0 is prerequisite to everything. Epic 1 depends on 0. Epic 2 can start after 0 (doesn't need Notion data to build the UI). Epics 3, 4, 5 can run in parallel after 2.

## Key Decisions to Make

These need to be resolved in PRDs or ADRs before implementation:

1. **Photo storage** — Where do item photos live? Options: local filesystem (like media posters per ADR-009), or a dedicated photos directory. Photos need to be uploadable from mobile (phone camera → POPS). Compress on upload (resize to max 1920px) to manage storage.
2. **Notion migration strategy** — One-time import + hard cutover to POPS. No bidirectional sync — too painful for marginal benefit. Import everything, verify, then stop using Notion for inventory.

## Resolved Decisions

Decisions already made through discussion:

1. **Drizzle ORM** — Per ADR-011, all schema work uses Drizzle. The existing `home_inventory` table will be migrated to a Drizzle schema as part of Foundation Epic 6.
2. **Workspace package** — Per ADR-002, inventory becomes `@pops/app-inventory` as a workspace package plugged into the shell.
3. **Location hierarchy: tree with self-referential parent** — A `locations` table with `parent_id` FK. Arbitrary depth, multiple roots (Home, Car, Storage Cage, Friend X). Not flat select dropdowns. The tree is set up once and rarely changes — the UI should make initial setup painless but doesn't need to optimise for frequent reorganisation.
4. **Connections: untyped bidirectional** — A junction table `item_connections(item_a_id, item_b_id)`. No connection types — the item's own metadata (Type: Cable, name: "HDMI cable") carries the semantic meaning. Inserting one row means both items see the connection. A device can have many connections (TV ↔ HDMI, TV ↔ optical, TV ↔ power supply). Multiple connections between the same pair of items are not needed — each physical cable/wire is its own item.
5. **Custom asset IDs: first-class field** — A prominent, searchable, unique text field. Human-readable typed prefixes (HDMI01, ETHER04, ROUTER01, PB03, PS002). This is how items are physically identified — look at the tag, search POPS.
6. **Borrowed items: location-based for now** — "Friend X" or "Mum's Place" as a root location handles the 80% case. A proper lending system (who, when, return date, reminders) is a future feature tracked in ideas.
7. **Rich notes per item** — Items can have free-form notes/specs (like the Capivara server's hardware specs in Notion). Stored as a text field, rendered as markdown in the detail page.

## Risks

- **Notion migration fidelity** — The Notion inventory has rich page content (specs, photos embedded as page content). Extracting structured data from Notion pages is straightforward; extracting photos requires downloading them from Notion's S3 URLs (which are temporary signed URLs). Mitigation: use the Notion API to fetch page content and download images during the import.
- **Location tree setup effort** — The initial setup of a 4-5 level deep location tree (Home → Room → Furniture → Shelf → Drawer) is tedious. Mitigation: the import from Notion seeds the tree from existing Room + Location data. Manual additions after that are incremental. AI could eventually help ("I put the new router in the bedroom wardrobe, right door" → auto-creates the location path).
- **Connection graph complexity** — A fully connected graph of 100+ items with cables, power supplies, and infrastructure can get visually overwhelming. Mitigation: start with a flat connection list per item. Graph visualisation (Epic 3) is a stretch goal — the list view is the MVP.
- **Photo volume** — If every item gets 1-3 photos, a 100-item inventory = 100-300 photos. At ~500 KB compressed, that's 50-150 MB. Manageable. Budget ~500 MB for growth.
- **Paperless-ngx API stability** — Paperless-ngx has a REST API but it's a community project. Mitigation: isolate behind a service interface so it can be swapped or disabled.
- **Scope creep toward asset management** — This is a personal home inventory, not an enterprise CMDB. No barcode scanning, no depreciation, no multi-location warehousing. The connectivity graph is the most complex feature — keep everything else simple.

## Out of Scope

- Barcode/QR code scanning (future enhancement)
- Depreciation or financial asset tracking (finance app's domain)
- Lending/borrowing system with return tracking and reminders (future feature — see ideas)
- Automated item discovery (scanning network devices, etc.)
- Insurance claim submission workflow (POPS produces the report — you submit it yourself)
- Maintenance scheduling (separate Maintenance theme)
- Connection types (power, data, audio) — the item's own Type field carries this meaning
