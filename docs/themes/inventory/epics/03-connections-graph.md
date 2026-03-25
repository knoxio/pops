# Epic: Connections & Graph

**Theme:** Inventory
**Priority:** 3 (can run after Epic 2)
**Status:** Done

## Goal

Build the connection management UI and connection chain tracing. Users can connect items, browse connections from detail pages, and trace chains (wall outlet → power board → power supply → device). Optional: graph visualisation of item connections.

## Scope

### In scope

- **Connection management on detail pages:**
  - "Connect to..." action on item detail page
  - Search/autocomplete to find the item to connect to (by name or asset ID)
  - Connected items list with links to their detail pages
  - "Disconnect" action per connection
  - Connection count shown on item cards in the list view
- **Connection chain tracing:**
  - From any item, follow connections recursively to see the full chain
  - "What's plugged into this power board?" → shows all items connected to it, and items connected to those, etc.
  - "Trace to wall" — follow connections upstream until reaching a wall outlet or root infrastructure item
  - Display as an expandable tree or indented list
- **Ethernet wall plug pairing:**
  - Wall plugs (ETH04-BED, ETH04-LVG) are items in different locations that connect to each other
  - The matching ID convention (04) is captured in the asset ID — no special schema needed
  - Connection between ETH04-BED and ETH04-LVG is a regular item_connections row
- **Connection UI components:**
  - `ConnectionChain` — expandable tree view showing recursive connections from an item
  - `ConnectDialog` — search/autocomplete modal for connecting two items
  - Update `ConnectionsList` from Epic 2 with disconnect actions and chain expansion
- **Graph visualisation (stretch goal):**
  - Visual node-and-edge graph of connected items
  - Nodes = items (with icon by type), edges = connections
  - Click node to navigate to item detail
  - Filter by room, type, or connection depth
  - Library: lightweight graph renderer (e.g., react-force-graph, d3-force, or custom SVG)

### Out of scope

- Connection types (power, data, audio) — the item's Type field carries this
- Automated connection discovery (network scanning, etc.)
- Connection history or logging ("was previously connected to X")
- Batch connection management (connect 5 cables to a device at once)

## Deliverables

1. "Connect to..." action on item detail pages
2. Search/autocomplete for finding items to connect
3. Disconnect action per connection
4. Connection chain tracing (recursive traversal)
5. `ConnectionChain` component — expandable tree of connected items
6. `ConnectDialog` component — modal for creating connections
7. Connection count on item cards
8. Graph visualisation (stretch goal)
9. Unit tests for chain traversal logic
10. `mise db:seed` updated with a realistic connection chain (wall plug → power board → 3 power supplies → 3 devices)
11. Storybook stories for connection components

## Dependencies

- Epic 0 (Schema Upgrade) — `item_connections` table
- Epic 2 (App Package & Edit UI) — detail pages to extend

## Risks

- **Recursive query performance** — Tracing a connection chain is a recursive graph traversal. SQLite supports recursive CTEs (`WITH RECURSIVE`), which handle this efficiently at the expected scale (<1,000 items). Mitigation: use a recursive CTE with a depth limit (e.g., 10 levels) to prevent infinite loops from circular connections.
- **Circular connections** — If A connects to B and B connects to A... that's just one connection (the junction table prevents this). But if A→B→C→A through intermediaries, the recursive traversal could loop. Mitigation: track visited nodes during traversal.
- **Graph visualisation complexity** — A fully connected graph of 50+ items can be visually overwhelming. Mitigation: graph visualisation is a stretch goal. The expandable tree list is the MVP — it handles the "what's plugged into this" use case without a graph library.
