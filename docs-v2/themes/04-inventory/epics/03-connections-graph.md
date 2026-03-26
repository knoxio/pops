# Epic 03: Connections & Graph

> Theme: [Inventory](../README.md)

## Scope

Build bidirectional item connections and connection chain tracing. One row in the connections table means both items see the link. Trace from a wall outlet through power boards to every connected device. Optional graph visualisation as a stretch goal.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 048 | [Connections & Graph](../prds/048-connections-graph/README.md) | Connect dialog, connections list on detail page, chain tracing with recursive CTE, graph visualisation (stretch goal) | Partial |

## Dependencies

- **Requires:** Epic 01 (item detail page to display connections on)
- **Unlocks:** Power/cable tracing, "what's plugged into this?" answers

## Out of Scope

- Connection types (power, data, audio — item metadata carries this)
- Automated connection discovery (network scanning)
