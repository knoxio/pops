# Paperless Integration

> Status: Done — Paperless-ngx document linking is shipped end-to-end (status/search proxy, link/unlink/list, thumbnail proxy, item-detail UI). Two refinements deferred to ideas: an unlink confirmation step and fully hiding the section when Paperless is down (see `../../ideas/paperless-unlink-confirm.md` and `../../ideas/paperless-graceful-hide.md`).

Link Paperless-ngx documents (receipts, warranties, manuals, invoices) to inventory items. POPS stores only the link (Paperless document id + type), never document content. Users search Paperless from the item-detail page, link a document with a type, see linked documents grouped by type with thumbnails, and jump out to the Paperless web UI. The integration is opt-in: absent its env config, the whole feature is invisible.

## Gating & Config

The integration is enabled when **both** `PAPERLESS_BASE_URL` and `PAPERLESS_API_TOKEN` are present in the pillar container's env. The client factory returns `null` otherwise; status reports `configured: false` and the UI section renders nothing. Auth is `Authorization: Token <token>` on every Paperless call. Metadata/search calls time out at 5s, thumbnail fetches at 10s, so a slow Paperless never blocks the pillar.

- [x] Gating is presence of both env vars; missing either ⇒ feature off, no error.
- [x] All Paperless requests carry `Authorization: Token <token>`.
- [x] 5s timeout on search/metadata, 10s on thumbnails; network errors are caught, never thrown to the wire as 500-by-default.

## Data Model — `item_documents`

| Column                  | Type    | Notes                                                 |
| ----------------------- | ------- | ----------------------------------------------------- |
| `id`                    | INTEGER | PK, autoincrement                                     |
| `item_id`               | TEXT    | FK → `home_inventory(id)` ON DELETE CASCADE, NOT NULL |
| `paperless_document_id` | INTEGER | NOT NULL — Paperless-ngx document id                  |
| `document_type`         | TEXT    | NOT NULL — one of the five document types             |
| `title`                 | TEXT    | nullable — denormalised Paperless title at link time  |
| `created_at`            | TEXT    | NOT NULL, default `datetime('now')` — when linked     |

- UNIQUE `(item_id, paperless_document_id)` — a document links to an item at most once.
- Indexes on `item_id` and on `paperless_document_id`.

`item_documents` lives in the inventory pillar's own SQLite DB alongside items, fixtures, connections, photos, warranties and reports.

- [x] Table, unique pair constraint, and both indexes exist per the schema above.
- [x] Document type is one of `receipt | warranty | manual | invoice | other`.
- [x] Deleting an item cascade-deletes its `item_documents` rows (Paperless documents are untouched).

## REST API (mounted at `/api/inventory`)

| Method & Path                   | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `GET /paperless/status`         | `{ configured, available, baseUrl }` — config presence + reachability       |
| `GET /paperless/search?query=`  | Proxy Paperless search; query 2–200 chars; `412` when not configured        |
| `POST /items/:itemId/documents` | Link a document: body `{ paperlessDocumentId, documentType, title? }` → 201 |
| `GET /items/:itemId/documents`  | List an item's linked documents (paginated, `limit`/`offset`)               |
| `DELETE /documents/:id`         | Unlink by link id                                                           |

Plus one raw (non-contract, no OpenAPI surface) byte route:

| `GET /inventory/documents/:id/thumbnail` | Proxy the Paperless thumbnail image (avoids browser CORS on the docker net) |

`status` derives `available` by calling Paperless `GET /api/document_types/` and reporting `false` on any failure. `search` maps Paperless documents to `{ id, title, created, originalFileName, thumbnailUrl }`, where `thumbnailUrl` is the document's direct Paperless thumb URL (`<baseUrl>/api/documents/<id>/thumb/`), rendered straight in the search dialog. The thumbnail _proxy_ route is used by the linked-documents list (keyed on the stored `paperlessDocumentId`), not by search results. The proxy returns `503` when unconfigured, `404` when Paperless 404s the thumbnail, `502` on other upstream/network failures, and caches successful images for an hour.

- [x] `GET /paperless/status` returns `configured`/`available`/`baseUrl`; never throws when Paperless is down.
- [x] `GET /paperless/search` returns the mapped result array and `412` (`inventory.paperless.notConfigured`) when env is absent.
- [x] `POST /items/:itemId/documents` validates `paperlessDocumentId` is a positive int and `documentType` is in the enum; returns 201 with the created link.
- [x] Re-linking the same `(item, document)` pair is rejected as a conflict (typed `DocumentConflictError` → 409), surfaced in the UI as "already linked".
- [x] Linking to a non-existent item returns 404.
- [x] `DELETE /documents/:id` returns 404 when no link row matches; 200 on success.
- [x] `GET /items/:itemId/documents` is paginated and ordered by link `id` ascending (deterministic insertion order).
- [x] Thumbnail proxy returns 503/404/502 for unconfigured/deleted/upstream-error respectively and sets `Cache-Control: public, max-age=3600` on success.

## Frontend — item-detail Documents section

The item-detail page renders a Documents section driven by `GET /paperless/status`:

- `configured: false` ⇒ section renders nothing.
- `configured: true, available: false` ⇒ header + "Paperless-ngx unavailable" line.
- available ⇒ full section: a "Link Document" search dialog and the grouped list.

The "Link Document" dialog searches Paperless (query enabled at ≥2 chars), shows result rows (thumbnail, title, date, original filename) and a document-type selector defaulting to `receipt`; picking a row links it. Linked documents are grouped by type (Receipts → Warranties → Manuals → Invoices → Other), each row showing a proxied thumbnail (skeleton while loading, file-icon placeholder on error), title (falling back to `Document #<id>`), linked date, a "View in Paperless" link (`<baseUrl>/documents/<id>/details`, new tab), and an unlink button.

- [x] Section visibility follows `status` (hidden when unconfigured, "unavailable" line when down, full when available).
- [x] "Link Document" opens a search dialog backed by `GET /paperless/search`; type selector defaults to `receipt`.
- [x] Linking a duplicate shows "This document is already linked to this item"; success toasts and refreshes the list.
- [x] Linked documents are grouped by type with empty groups omitted; each card has thumbnail, title, linked date, "View in Paperless", and unlink.
- [x] Thumbnail shows a skeleton while loading and a placeholder icon when the proxy errors (document deleted in Paperless).

## Business Rules & Edge Cases

- [x] A Paperless document may link to many items; the same document links to a given item only once.
- [x] Paperless unavailability is non-fatal: status reports `available: false`, no error toast, the link affordances disappear.
- [x] A document deleted in Paperless leaves the link row intact; its thumbnail proxy 404s and the UI shows the placeholder.
- [x] Search with no matches yields an empty result list in the dialog.
- [x] Invalid document type or non-positive document id is rejected at the contract boundary.

## Out of Scope

- Document upload from POPS (the `documentFiles.*` direct-upload surface is separate; Paperless owns its own ingestion).
- OCR / text extraction, correspondent/tag management UI, or any full Paperless management surface inside POPS.
- Automatic matching of documents to items by name or purchase date.
