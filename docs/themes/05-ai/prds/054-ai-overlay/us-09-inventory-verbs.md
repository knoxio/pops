# US-09: Inventory domain verbs

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the AI, I have inventory verbs so I can search items, create new items, update details, and manage locations and connections.

## Acceptance Criteria

- [ ] `inventory:search-items { query?, location?, type? }` — search items
- [ ] `inventory:get-item { id }` — item details with location, connections, photos
- [ ] `inventory:get-location-tree` — full location hierarchy
- [ ] `inventory:get-connections { itemId }` — connected items
- [ ] `inventory:create-item { name, type?, location?, assetId?, purchasePrice?, notes? }` — create item
- [ ] `inventory:update-item { id, name?, type?, condition?, purchasePrice?, notes? }` — update fields
- [ ] `inventory:move-item { id, locationId }` — change item location
- [ ] `inventory:add-connection { itemId, targetItemId, connectionType? }` — connect two items
- [ ] All verbs registered with Zod param schemas
- [ ] Tests: each verb executes correctly, create returns new item with ID
