# Epic: Notion Import

**Theme:** Inventory
**Priority:** 1 (depends on schema)
**Status:** Done

## Goal

One-time import of all inventory data from the Notion "Home Inventory" database into POPS. Items, metadata, photos, and relationships are migrated. After import and verification, Notion is no longer the source of truth for inventory.

## Scope

### In scope

- Fetch all items from Notion Home Inventory database via Notion API
- Map Notion properties to POPS schema:
  - Item Name, Brand/Manufacturer, Model, ID → item fields + asset_id
  - Room + Location → create location tree entries, set location_id
  - Type, Condition, In-use, Deductible → item fields
  - Purchase Date, Warranty Expires → date fields
  - Est. Replacement Value, Est. Resale Value → number fields
  - Purchase Transaction, Purchased From → cross-domain FK links (match by Notion relation → existing POPS entities/transactions)
  - Used By → create item_connections rows (match by item name → asset_id)
- Extract photos from Notion page content:
  - Download images from Notion's signed S3 URLs
  - Store locally in the inventory photos directory
  - Create `item_photos` rows
- Extract rich text content from Notion pages (specs, notes) → `notes` field
- Build the location tree from unique Room + Location combinations in Notion data
- Build item connections from the "Used By" multi-select values (match by item name)
- Import progress tracking and reporting:
  - Total items, imported, skipped, errors
  - Unmatched "Used By" references logged for manual review
  - Unmatched "Purchase Transaction" / "Purchased From" relations logged
- Dry-run mode: report what would be imported without writing

### Out of scope

- Ongoing Notion sync (this is a one-time import + cutover)
- Creating new Notion data — POPS never writes back to Notion
- Importing Notion page comments or history
- Importing items from other Notion databases

## Deliverables

1. Import script (mise task: `mise import:notion-inventory`)
2. Notion API client for fetching database rows and page content
3. Photo download and local storage
4. Location tree auto-creation from Room + Location values
5. Item connection creation from "Used By" values
6. Cross-domain FK matching for Purchase Transaction and Purchased From
7. Dry-run mode with detailed report
8. Import log with counts, errors, and unmatched references
9. Verification report: Notion item count vs POPS item count, field-by-field spot checks

## Dependencies

- Epic 0 (Schema Upgrade) — target schema must exist
- Notion API access (requires setup — the previous Notion client was removed in PRs #49/#51. Use the Notion MCP integration or build a lightweight API client for the import script)

## Risks

- **Notion photo URL expiry** — Notion's S3 signed URLs expire after 1 hour. The import must download photos immediately after fetching page content, not queue them for later. Mitigation: download photos inline during the import loop.
- **"Used By" name matching** — Notion stores "Used By" as device names (e.g., "Capivara", "TV"). These need to match to POPS item names or asset IDs. Partial matches and mismatches need manual review. Mitigation: log all unmatched references, allow manual connection creation after import.
- **Cross-domain relation matching** — Notion's "Purchase Transaction" and "Purchased From" are relations to other Notion databases. Matching these to POPS transactions/entities requires mapping Notion page IDs to POPS record IDs. Mitigation: match by title/name where possible, log unmatched for manual linking.
- **Rich content parsing** — Notion page content is in Notion's block format (not plain text). Specs like the Capivara's hardware list need to be converted to markdown for the `notes` field. Mitigation: use the Notion API's markdown export or a lightweight block-to-markdown converter.
