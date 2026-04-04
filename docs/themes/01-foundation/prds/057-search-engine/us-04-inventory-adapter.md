# US-04: Inventory search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want inventory data searchable so that I can find items by name or asset ID from the global search, rendered with asset badges and location.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "inventory"`, icon: `"Box"`, color: `"amber"`
- [ ] Searches items by `item_name` column (case-insensitive LIKE)
- [ ] Searches items by `asset_id` column (exact match first, then prefix match)
- [ ] Asset ID exact matches score 1.0, prefix matches score 0.9 (higher than name matches — exact identifier)
- [ ] Relevance scoring for name: exact (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField` set to `"assetId"` or `"itemName"` depending on what matched
- [ ] If context has an entity with a location, boost items in that location (optional v1 enhancement)
- [ ] Hit data shape: `{ itemName, assetId, location, type, condition }`
- [ ] `ResultComponent` renders asset ID badge (monospace, prominent) + item name + location breadcrumb + type
- [ ] `ResultComponent` highlights the matched portion using `query` prop + `matchField`/`matchType`
- [ ] Tests: name search works, asset ID exact match ranks highest, scoring correct

## Notes

Asset ID search is a key use case — look at a cable's tag (HDMI01), type it in search, find the item instantly. Asset ID matches should always outrank name substring matches.
