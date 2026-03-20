# PRD-021: Connections & Graph

**Epic:** [03 — Connections & Graph](../themes/inventory/epics/03-connections-graph.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

Items are physically connected — cables to devices, power supplies to power boards, ethernet plugs across rooms. The schema supports bidirectional connections (PRD-017), but the UI needs a way to create, manage, and trace these connections. The key use case: look at a wall power plug, check its ID, and see every device hanging off it through the chain.

## Goal

A connection management UI integrated into item detail pages, plus connection chain tracing that traverses the graph recursively. Optional graph visualisation as a stretch goal.

## Requirements

### R1: Connect Items

**On item detail page → Connections section:**
- "Connect to..." button
- Opens `ConnectDialog`: search/autocomplete for items by name or asset ID
- Select an item → `inventory.connections.connect({ itemAId, itemBId })`
- New connection appears immediately in the connections list
- Toast: "Connected [Item A] to [Item B]"

**Validation:**
- Can't connect an item to itself
- Can't create a duplicate connection (already connected)
- Both items must exist

### R2: Disconnect Items

**On item detail page → Connections section:**
- Each connected item has a "Disconnect" action (icon button or swipe on mobile)
- No confirmation dialog — disconnecting is easily reversible by reconnecting
- `inventory.connections.disconnect({ itemAId, itemBId })`
- Toast: "Disconnected [Item A] from [Item B]"

### R3: Connections List on Detail Page

**On item detail page → "Connected to" section:**

- List of all directly connected items
- Each entry shows: asset ID badge, item name, type badge, location breadcrumb
- Click → navigate to that item's detail page
- Connection count in the section header: "Connected to (4)"
- "Connect to..." button at the bottom

**Ordering:** by type (Electronics first, then Cables, then other), then by name.

### R4: Connection Chain Tracing

The key feature: trace connections recursively from any item.

**"Trace connections" button or expandable section on the detail page:**

- Starting from the current item, follow all connections recursively
- Display as an expandable tree:

```
ROUTER01 — Asus Router
├── ETHER04 — Ethernet cable 3m (yellow)
│   └── ETH04-BED — Wall ethernet plug (Bedroom)
│       └── ETH04-LVG — Wall ethernet plug (Living Room)
│           └── SWITCH01 — TP-Link 2.5G Switch
│               ├── ETHER05 — Ethernet cable 1m
│               │   └── CAPIVARA — Server i7
│               └── ETHER06 — Ethernet cable 2m
│                   └── PS4 — PlayStation 4
├── ETHER03 — Ethernet cable 1m
│   └── HUEBRIDGE — Philips Hue Bridge
├── PS002 — Power supply 12V
│   └── PB03 — Power Board 3
│       └── WALL-PWR-BED-01 — Wall power outlet (Bedroom)
```

- Each node shows: asset ID, item name, type badge
- Click any node → navigate to that item's detail page
- Depth limit: 10 levels (configurable)
- Circular connections handled: visited nodes shown but not expanded again (marked as "↻ already shown")

**Data source:** `inventory.connections.traceChain({ itemId, maxDepth: 10 })`

**Implementation:** Recursive CTE in SQLite (see PRD-017 R7). The API returns a flat list with depth info; the frontend builds the tree.

### R5: Connection Count on Item Cards

In the item list (PRD-019), show connection count on each item:

- Table view: "Connections" column with count
- Grid view: small connection icon with count badge on the card
- Items with 0 connections show nothing (no "0" badge)

### R6: Connect During Item Creation

When creating a new item (PRD-019 R5), allow connecting it to existing items:

- "Connected to" section at the bottom of the create form
- Same `ConnectDialog` search/autocomplete
- Selected connections shown as a list with remove buttons
- Connections created after the item is saved (in the same operation)

Use case: "I just bought a new HDMI cable, I want to log it and immediately say it connects to the TV."

### R7: Graph Visualisation (Stretch Goal)

A visual node-and-edge graph of connected items.

**If implemented:**
- Accessible from a "View graph" button on the connections section
- Nodes = items (icon by type, coloured by type)
- Edges = connections
- Layout: force-directed (items cluster naturally)
- Click node → navigate to item detail
- Zoom and pan
- Filter: show only items connected to a specific item, or all items in a room

**Library:** Evaluate react-force-graph (WebGL, good performance), d3-force (SVG, more control), or cytoscape.js (full-featured graph library).

**This is a stretch goal.** The expandable tree view (R4) handles the primary use case. The graph is a nice-to-have visualisation.

## Out of Scope

- Connection types (power, data, audio) — item Type carries this
- Connection history ("was previously connected to X")
- Batch connect (connect 5 cables to a device at once)
- Auto-suggest connections based on item type or location
- Physical network topology mapping (that's a network tool, not an inventory)

## Acceptance Criteria

1. Items can be connected from the detail page via search/autocomplete
2. Items can be disconnected from the detail page
3. Connections list shows all directly connected items with metadata
4. Connection chain traces recursively with expandable tree view
5. Circular connections handled gracefully (visited nodes not re-expanded)
6. Chain tracing respects depth limit (default 10)
7. Connection count shown on item cards in list/grid view
8. New items can be connected during creation
9. All connections are bidirectional (A↔B, not A→B)
10. Duplicate connections prevented
11. Page responsive at all breakpoints
12. Storybook stories for: ConnectDialog, ConnectionsList, ConnectionChain
13. `mise db:seed` updated with a realistic connection chain (wall → power board → supplies → devices)
14. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes. All stories are parallelisable.

#### US-1a: ConnectDialog component
**Scope:** Create `ConnectDialog.tsx` + story. Modal/overlay with search input for finding items by name or asset ID. Autocomplete results with asset ID badge, name, type. Select an item to return it to the caller. Prevents selecting the current item (self-connection).
**Files:** `packages/app-inventory/src/components/ConnectDialog.tsx`, story

#### US-1b: Connect/disconnect on detail page
**Scope:** Add "Connect to..." button to `ItemDetailPage` connections section. Opens `ConnectDialog`. On select, calls `inventory.connections.connect`. "Disconnect" icon button per connection, calls `inventory.connections.disconnect`. Toast on success. Bidirectional: navigating to the connected item shows the reverse connection.
**Files:** `ItemDetailPage.tsx`

#### US-2: Enhanced ConnectionsList
**Scope:** Enhance `ConnectionsList.tsx` (from PRD-019 US-c6). Each connected item shows: asset ID badge, name, type badge, location breadcrumb. Click → navigate to that item's detail page. Connection count in section header ("Connected to (4)"). Order by type then name.
**Files:** `ConnectionsList.tsx`

#### US-3: Connection chain tracing
**Scope:** Create `ConnectionChain.tsx` component + story. "Trace connections" button/section on detail page. Uses `inventory.connections.traceChain` data. Renders as expandable tree: each node shows asset ID, name, type badge. Click any node → navigate. Circular connections: visited nodes shown with "↻ already shown" label, not expanded. Depth limit indicator.
**Files:** `packages/app-inventory/src/components/ConnectionChain.tsx`, story, `ItemDetailPage.tsx`

#### US-4: Connect during item creation
**Scope:** Add "Connected to" section to `ItemFormPage` (create mode). Uses `ConnectDialog` to search and add connections. Selected connections shown as a removable list. Connections created after item save (in the same operation or immediately after).
**Files:** `ItemFormPage.tsx`

#### US-5: Graph visualisation (stretch)
**Scope:** Create visual node-and-edge graph of connected items. Nodes = items (icon by type), edges = connections. Force-directed layout. Click node → navigate to detail. Zoom/pan. Optional filter by room or starting item. Library: react-force-graph or d3-force. Accessible via "View graph" button in connections section. **Stretch goal — implement only if time permits.**
**Files:** New graph component
