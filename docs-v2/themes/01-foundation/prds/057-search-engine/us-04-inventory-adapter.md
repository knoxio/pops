# US-04: Inventory search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want inventory data searchable so that I can find items by name or asset ID from the global search.

## Acceptance Criteria

- [ ] Searches items by item_name (LIKE)
- [ ] Searches items by asset_id (exact match, also partial)
- [ ] Results include: URI, item name, type badge, asset ID, location
- [ ] Asset ID matches ranked higher than name matches (exact identifier)

## Notes

Asset ID search is a key use case — look at a cable's tag (HDMI01), type it in search, find the item instantly.
