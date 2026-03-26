# US-03: Drag-and-drop reorder

> PRD: [047 — Location Tree Management](README.md)
> Status: To Review

## Description

As a user, I want to drag-and-drop locations to reorder siblings and move nodes between parents so that I can reorganise my location hierarchy visually.

## Acceptance Criteria

- [ ] Drag handle visible on each tree node (desktop only)
- [ ] Dragging a node between siblings reorders them — updates `sortOrder` via `inventory.locations.reorder`
- [ ] Dragging a node onto another node moves it as a child of the target — updates `parentId` via `inventory.locations.move`
- [ ] Drop indicator shows where the node will land (between siblings vs. inside a node)
- [ ] Dragging a node onto itself is a no-op
- [ ] Circular reference prevention: cannot drop a node onto any of its own descendants — drop target highlights as invalid
- [ ] Moving a node to a new parent places it at the end of that parent's children
- [ ] Tree state updates optimistically on drop; reverts on API error with toast
- [ ] Mobile fallback: up/down arrow buttons appear on each node instead of drag handles
- [ ] Up arrow moves node one position earlier among siblings; down arrow moves it one position later
- [ ] Arrow buttons disabled at the boundary (first child can't go up, last child can't go down)
- [ ] Mobile detection: arrow buttons shown when `pointer: coarse` media query matches

## Notes

Use a drag-and-drop library that supports tree structures (e.g., dnd-kit with sortable tree preset or similar). The server API for reorder accepts the new ordered list of sibling IDs. The move endpoint accepts the node ID, new parentId, and optional sortOrder.
