# US-04: Asset ID generation

> PRD: [046 — Item Create/Edit Form](README.md)
> Status: Done

## Description

As a user, I want to auto-generate human-readable asset IDs based on the item type so that I can quickly label items with consistent, unique identifiers without inventing them manually.

## Acceptance Criteria

- [x] "Auto-generate" button is adjacent to the Asset ID text input
- [x] Clicking auto-generate takes the current Type value, extracts a prefix (first 4-6 characters, uppercased), and appends the next sequential number with zero-padding (e.g., "HDMI01", "ELEC04", "FURN12")
- [x] Sequential number is determined by counting existing asset IDs with the same prefix and incrementing
- [x] Auto-generate replaces the current Asset ID input value (if any)
- [x] Auto-generate button is disabled when Type field is empty (prefix cannot be determined)
- [x] Manual entry is always accepted — the user can type any value into the Asset ID field
- [x] On blur, the Asset ID field validates uniqueness by calling `inventory.items.searchByAssetId`
- [x] If the asset ID is already in use by a different item, an inline error displays: "Asset ID already in use by ITEM_NAME"
- [x] In edit mode, the current item's own asset ID does not trigger the uniqueness error
- [x] If the asset ID field is empty, no uniqueness check is performed (asset ID is optional)
- [x] Uniqueness check shows a brief loading indicator during the API call
- [x] Generated IDs use zero-padded two-digit numbers (01-99); if 99+ items share a prefix, three digits are used (100+)
- [x] Tests cover: prefix extraction from different type values, sequential number calculation, auto-generate with empty type (disabled), manual entry, uniqueness validation on blur, self-reference in edit mode, empty field skips validation, zero-padding format

## Notes

The prefix extraction should take the first word of the type, uppercase it, and truncate to a reasonable length (4-6 characters). For example: "Electronics" → "ELEC", "HDMI Cable" → "HDMI", "Furniture" → "FURN". The sequential number queries existing asset IDs matching the prefix pattern. This is a convenience feature — users can always override with a manual ID.
