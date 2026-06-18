# US-01: Paperless API client

> PRD: [049 — Paperless-ngx Integration](README.md)
> Status: Done

## Description

As a developer, I want a Paperless-ngx API client service so that POPS can search documents, fetch thumbnails, and check Paperless availability.

## Acceptance Criteria

- [x] `PaperlessClient` service created with methods: `search(query)`, `getThumbnail(docId)`, `getDocument(docId)`, `healthCheck()`
- [x] Base URL and API token read from env vars (`PAPERLESS_BASE_URL`, `PAPERLESS_API_TOKEN`)
- [x] `search(query)` calls `GET /api/documents/?query=X` — returns array of `{ id, title, created, correspondent, thumbnailUrl }`
- [x] `getThumbnail(docId)` calls `GET /api/documents/:id/thumb/` — returns binary image data
- [x] `getDocument(docId)` calls `GET /api/documents/:id/` — returns full document metadata
- [x] `healthCheck()` calls `GET /api/documents/?page_size=1` — returns `{ available: true }` on 200, `{ available: false }` on any error
- [x] All requests include `Authorization: Token XXX` header
- [x] Request timeout: 5s for metadata/search requests, 10s for thumbnail fetches — slow Paperless responses do not block POPS
- [x] Connection errors caught and returned as `{ available: false }` — never thrown to callers
- [x] `item_documents` table created with columns per the data model
- [x] CRUD procedures created: `inventory.documents.link`, `inventory.documents.unlink`, `inventory.documents.listForItem`
- [x] Thumbnail proxy endpoint: `inventory.documents.thumbnail` — fetches from Paperless and serves to client (avoids CORS)
- [x] Health endpoint: `inventory.documents.health` — returns Paperless availability
- [x] Tests cover: successful search, search with no results, Paperless unavailable, invalid token, timeout handling

## Notes

The client is a thin wrapper around HTTP calls to Paperless. It does not cache results — Paperless handles its own caching. The thumbnail proxy is necessary because the browser cannot directly call Paperless due to CORS restrictions on the Docker network.
