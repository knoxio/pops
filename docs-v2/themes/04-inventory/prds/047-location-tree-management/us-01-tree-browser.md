# US-01: Tree browser

> PRD: [047 — Location Tree Management](README.md)
> Status: Done

## Description

As a user, I want a collapsible hierarchical tree view of all locations so that I can navigate my location structure at a glance.

## Acceptance Criteria

- [x] Tree view renders all locations hierarchically from the `inventory.locations.list` endpoint (fetches full tree in one call)
- [x] Each node displays: location name, item count badge, expand/collapse chevron
- [x] Chevron only appears on nodes that have children
- [x] Click chevron to expand/collapse a node's children
- [x] Multiple root nodes supported (locations with `parentId = NULL`)
- [x] Expand/collapse state persisted in session storage (survives page navigation, not browser close)
- [x] Selected node highlighted visually
- [x] Click node name to select it (triggers item panel load — wired in US-04)
- [x] Loading skeleton while tree data fetches
- [x] Empty state when no locations exist: "No locations — create your first location to organise items"
- [x] Tree handles arbitrary nesting depth without layout breakage

## Notes

Item count badge shows the direct item count for that location (not including sub-locations). The tree fetches all locations in a single API call and builds the hierarchy client-side. The tree component is reused by US-02 (CRUD), US-03 (drag-and-drop), and US-04 (items panel) — design it as a standalone component that accepts event callbacks.
