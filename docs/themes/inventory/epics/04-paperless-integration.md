# Epic: Paperless-ngx Integration

**Theme:** Inventory
**Priority:** 4 (can run after Epic 2)
**Status:** Done

## Goal

Link receipts, warranty documents, and manuals from Paperless-ngx to inventory items. When viewing an item, see its receipt, warranty card, and user manual without leaving POPS. This closes the gap Notion couldn't fill — "show me the receipt for this item."

## Scope

### In scope

- **Paperless-ngx API client:**
  - Authentication (API token via environment variable / Docker secret)
  - Search documents by title, tag, or correspondent
  - Fetch document metadata (title, created date, tags, correspondent)
  - Fetch document thumbnail / preview image
  - Generate document download URL
- **Document linking on item detail pages:**
  - "Link Document" action on item detail page
  - Search Paperless-ngx documents from within POPS (autocomplete/search modal)
  - Link one or more documents to an item (receipt, warranty, manual)
  - Document type tag: receipt, warranty, manual, other
  - Linked documents shown on item detail page with thumbnail preview
  - Click to open document in Paperless-ngx (or download PDF)
  - Unlink action
- **Link storage:**
  - `item_documents` table: item_id, paperless_document_id, document_type, linked_at
  - No local document storage — POPS stores the reference, Paperless-ngx stores the file
- **Connection configuration:**
  - Environment variables: `PAPERLESS_URL`, `PAPERLESS_API_TOKEN`
  - Connection test endpoint
  - Graceful degradation when Paperless-ngx not configured or unreachable

### Out of scope

- Uploading documents to Paperless-ngx from POPS (use Paperless-ngx directly)
- OCR or document content extraction
- Auto-matching receipts to items (AI territory — future)
- Linking documents to finance transactions (Documents Vault theme)
- Paperless-ngx tag management from POPS

## Deliverables

1. Paperless-ngx API client service
2. Document search from within POPS
3. `item_documents` Drizzle schema and tRPC router
4. "Link Document" modal on item detail pages
5. Linked documents display with thumbnails
6. Connection configuration and test
7. Graceful degradation when Paperless-ngx not configured
8. Unit tests for API client (mocked responses)
9. `.env.example` updated with `PAPERLESS_URL` and `PAPERLESS_API_TOKEN`
10. `pnpm typecheck` and `pnpm test` pass

## Dependencies

- Epic 0 (Schema Upgrade) — base schema
- Epic 2 (App Package & Edit UI) — detail pages to extend
- Paperless-ngx running and accessible on the network

## Risks

- **Paperless-ngx API versioning** — The REST API may change between Paperless-ngx versions. Mitigation: isolate behind a service interface, target the latest stable API version.
- **Document thumbnail quality** — Paperless-ngx generates thumbnails but quality varies by document type. Mitigation: show thumbnails as previews, link to full document for actual viewing.
- **Network dependency** — Paperless-ngx runs on the same N95, so local network is reliable. But if the service is down, linked documents won't load. Mitigation: show "Paperless-ngx unavailable" gracefully, item detail page still works without documents.
