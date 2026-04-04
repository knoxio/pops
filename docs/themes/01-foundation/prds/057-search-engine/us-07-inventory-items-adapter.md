# US-07: Inventory items search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search inventory items by name and asset ID and return typed `SearchHit` results with location and condition.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "inventory-items"`, icon: `"Box"`, color: `"amber"`
- [ ] Searches items by `item_name` column (case-insensitive LIKE)
- [ ] Searches items by `asset_id` column (exact match first, then prefix match)
- [ ] Asset ID exact matches score 1.0, prefix matches score 0.9 (higher than name matches)
- [ ] Relevance scoring for name: exact (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField` set to `"assetId"` or `"itemName"` depending on what matched
- [ ] Hit data shape: `{ itemName, assetId, location, type, condition }`
- [ ] Respects `options.limit` parameter
- [ ] Tests: name search works, asset ID exact match ranks highest, scoring correct

## Notes

Asset ID search is the key use case — look at a cable's tag (HDMI01), type it in search, find it instantly. Asset ID matches always outrank name substring matches.
