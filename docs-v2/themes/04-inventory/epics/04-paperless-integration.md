# Epic 04: Paperless-ngx Integration

> Theme: [Inventory](../README.md)

## Scope

Integrate with Paperless-ngx to link receipts, warranties, and manuals to inventory items. Search Paperless documents from within POPS, link them to items with a tag (receipt/warranty/manual), and display thumbnails on the item detail page.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 049 | [Paperless-ngx Integration](../prds/049-paperless-integration/README.md) | Document search modal, linking with tags, thumbnail display, graceful degradation when Paperless is unavailable | Done |

## Dependencies

- **Requires:** Epic 01 (item detail page to display documents on), Infrastructure (Paperless-ngx running)
- **Unlocks:** Receipt/warranty proof for insurance reports (Epic 05)

## Out of Scope

- Document upload from POPS (Paperless handles ingestion)
- OCR or text extraction
- Full Paperless management UI
