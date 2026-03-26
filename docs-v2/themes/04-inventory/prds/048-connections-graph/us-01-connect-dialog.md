# US-01: Connect dialog

> PRD: [048 — Connections & Graph](README.md)
> Status: To Review

## Description

As a user, I want to connect items to each other and see existing connections on the item detail page so that I can track which items are physically linked.

## Acceptance Criteria

- [ ] "Connect Item" button on the item detail page opens a search dialog
- [ ] Search dialog: text input that searches items by name or asset ID via `inventory.items.list` with search filter
- [ ] Search results show: item name, asset ID, type badge — one row per result
- [ ] Selecting a result calls `inventory.connections.create` with the current item and selected item
- [ ] Self-connection attempt shows inline validation error ("Cannot connect an item to itself")
- [ ] Duplicate connection attempt shows toast error ("These items are already connected")
- [ ] Connection list section on item detail page — fetched via `inventory.connections.listForItem`
- [ ] Each connection row shows: connected item name, asset ID, type badge, "Disconnect" button
- [ ] Clicking a connection row navigates to the connected item's detail page
- [ ] "Disconnect" button opens confirmation: "Disconnect [item name]?" — confirming calls `inventory.connections.delete`
- [ ] Connection list updates immediately after connect/disconnect (optimistic or refetch)
- [ ] Empty state: "No connections — connect related items to track physical links"
- [ ] Toast confirmation on successful connect and disconnect

## Notes

The `A < B` dedup normalisation is server-side. The client sends both item IDs in any order; the API normalises before insert. The connection list shows connections from both directions (where the item is A or B).
