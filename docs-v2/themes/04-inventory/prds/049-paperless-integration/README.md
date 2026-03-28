# PRD-049: Paperless-ngx Integration

> Epic: [04 — Paperless-ngx Integration](../../epics/04-paperless-integration.md)
> Status: Partial

## Overview

Link receipts, warranties, and manuals from Paperless-ngx to inventory items. Search Paperless documents from within POPS, link with a tag (receipt/warranty/manual), display thumbnails on item detail page.

## Integration Architecture

- Paperless-ngx runs as a separate Docker container on the same network (`pops-documents`)
- Communication via Paperless REST API (token auth)
- POPS stores document links (Paperless document ID + tag), not document content
- Graceful degradation: if Paperless is unavailable, the document section hides without errors

## Data Model

### item_documents (link table)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, UUID | |
| item_id | TEXT | FK > items(id) ON DELETE CASCADE, NOT NULL | Linked inventory item |
| paperless_doc_id | INTEGER | NOT NULL | Paperless-ngx document ID |
| tag | TEXT | NOT NULL | "receipt", "warranty", or "manual" |
| linked_at | TEXT | NOT NULL | ISO 8601 timestamp |

**Constraint:** UNIQUE on (item_id, paperless_doc_id) — same document cannot be linked twice to the same item.

**Index:** item_id (for fast lookup of all documents for an item)

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `inventory.documents.search` | query | `{ data: PaperlessDocument[] }` | Proxies Paperless search API, returns id/title/created/correspondent/thumbnailUrl |
| `inventory.documents.link` | itemId, paperlessDocId, tag | `{ data: ItemDocument }` | Creates link row, validates tag enum |
| `inventory.documents.unlink` | id | `{ message }` | Removes link row by ID |
| `inventory.documents.listForItem` | itemId | `{ data: ItemDocument[] }` | All document links for an item, grouped by tag |
| `inventory.documents.thumbnail` | paperlessDocId | binary (proxied image) | Proxies Paperless thumbnail API to avoid CORS issues |
| `inventory.documents.health` | (none) | `{ available: boolean }` | Checks if Paperless API is reachable |

## Paperless API Integration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/documents/?query=X` | GET | Search documents by title/content |
| `/api/documents/:id/thumb/` | GET | Document thumbnail image |
| `/api/documents/:id/` | GET | Document metadata |

Auth header: `Authorization: Token XXX` — token stored in settings table or env var (`PAPERLESS_API_TOKEN`).

## Business Rules

- Tags must be one of: "receipt", "warranty", "manual"
- Same document can be linked to multiple items (e.g., one receipt for a bundle purchase)
- Same document cannot be linked twice to the same item (unique constraint)
- Deleting an item cascade-deletes its document links (not the Paperless documents)
- Paperless unavailability is non-fatal: health check returns `available: false`, UI hides document section
- Thumbnail proxy avoids CORS: POPS API fetches from Paperless and serves to the client

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Paperless unavailable | Health check returns `available: false`, document section hidden, no error toast |
| Paperless document deleted externally | Link remains in POPS — thumbnail returns 404, display shows "Document unavailable" placeholder |
| Duplicate link attempt | Rejected with unique constraint error (409) |
| Invalid tag | Rejected with validation error |
| Paperless search returns no results | Empty result list in modal |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-paperless-client](us-01-paperless-client.md) | Paperless API client (search, thumbnail, metadata), token auth, health check, graceful degradation | Partial | No (first) |
| 02 | [us-02-link-documents](us-02-link-documents.md) | Document search modal, select + tag, link storage, unlink action | Done | Blocked by us-01 |
| 03 | [us-03-document-display](us-03-document-display.md) | Documents section on item detail, grouped by tag, thumbnails, "View in Paperless" links | Partial | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01.

## Out of Scope

- Document upload from POPS (Paperless handles ingestion)
- OCR or text extraction within POPS
- Full Paperless management UI
- Automatic document matching based on item name or purchase date
