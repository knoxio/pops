# US-03: Connections section

> PRD: [045 — Item Detail Page](README.md)
> Status: To Review

## Description

As a user, I want to see all items connected to the current item and trace the full connection chain so that I can understand what is physically linked together (e.g., which devices are plugged into a power board).

## Acceptance Criteria

- [ ] Connections section displays a list of connected items fetched from `inventory.connections.listForItem`
- [ ] Each connected item shows: name, asset ID (if present), and type
- [ ] Clicking a connected item navigates to its detail page (`/inventory/items/:id`)
- [ ] "Trace Chain" button is visible when the item has at least one connection
- [ ] Clicking "Trace Chain" calls `inventory.connections.traceChain` and renders the result
- [ ] Chain visualisation displays items as a list or tree with depth indication (indentation or nesting)
- [ ] Each item in the chain is clickable, navigating to its detail page
- [ ] Chain visualisation shows the current item highlighted or marked as the starting point
- [ ] "Trace Chain" button is hidden when the item has no connections
- [ ] When no connections exist, the section shows "No connections" text
- [ ] Tests cover: connected items list rendering, click navigation, trace chain trigger, chain depth display, empty state, trace chain with current item highlighted

## Notes

The chain visualisation for this story is a flat or indented list — a full graph visualisation is part of Epic 03. The traceChain response includes depth information per item, which can be used for indentation. Keep the chain display simple and readable; a recursive tree or indented list is sufficient.
