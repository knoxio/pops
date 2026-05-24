# US-02: Connection write tools & barrel

> PRD: [PRD-103 — Inventory MCP Write Tools](README.md)
> Status: Done

## Goal

Provide MCP connect/disconnect tools for item-item connections and aggregate all inventory domain tools into the central tools interface.

## Acceptance Criteria

- [x] Connection tools expose list, graph, connect, and disconnect behaviors
- [x] All inventory domain tools (locations, items, connections) are available through the central tool interface
- [x] Unit tests cover all connection tool behaviors, including error propagation
- [x] Tool registry assertions verify the complete set of inventory write tools
- [x] Lint, format, and typecheck pass; full test suite green
