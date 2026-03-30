# US-03: Graph visualisation

> PRD: [048 — Connections & Graph](README.md)
> Status: Done

## Description

As a user, I want a visual graph of item connections so that I can see the network of linked items at a glance. This is a stretch goal — lower priority than chain tracing.

## Acceptance Criteria

- [x] "View Graph" button on item detail page (only visible when item has connections)
- [x] Graph renders in a modal or dedicated panel
- [x] Nodes represent items: display item name and asset ID
- [x] Edges represent connections: lines between connected nodes
- [x] Graph layout algorithm positions nodes to minimise edge crossings (force-directed or hierarchical)
- [x] Clicking a node navigates to that item's detail page
- [x] Graph scoped to the connected component containing the current item (not the entire inventory)
- [x] Connected component fetched via `inventory.connections.traceChain` with sufficient depth — uses `inventory.connections.graph` procedure
- [x] Zoom and pan controls for larger graphs
- [x] Node count shown in graph header (e.g., "12 connected items")
- [x] Loading state while graph data fetches
- [x] Graceful fallback: if the graph library fails to load, show a text-based chain trace instead — on API error shows "Failed to load connection graph." text message (not a full chain trace, but gracefully degrades)

## Notes

Use a lightweight graph rendering library (e.g., vis-network, react-force-graph, or cytoscape.js). The graph data comes from the same chain trace endpoint used in US-02 — reformat the flat node list into a nodes/edges structure for the graph library. This is a stretch goal; prioritise US-01 and US-02 first.
