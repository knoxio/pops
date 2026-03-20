# PRD-022: Paperless-ngx Integration

**Epic:** [04 — Paperless-ngx Integration](../themes/inventory/epics/04-paperless-integration.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

Receipts, warranty cards, and user manuals live in Paperless-ngx — already OCR'd, tagged, and searchable. But there's no connection between a Paperless-ngx document and the inventory item it relates to. When a warranty claim requires proof of purchase, the user has to manually search Paperless-ngx. Linking documents to items closes this gap.

## Goal

From an item's detail page, search Paperless-ngx, link relevant documents (receipt, warranty, manual), and view them without leaving POPS. The link is a reference — POPS doesn't store the document, just points to it in Paperless-ngx.

## Requirements

### R1: Paperless-ngx API Client

Create `apps/pops-api/src/modules/inventory/paperless/`:

```
inventory/paperless/
  client.ts           (HTTP client for Paperless-ngx REST API)
  types.ts            (response types)
  service.ts          (search, fetch metadata, thumbnails)
  client.test.ts
```

**Paperless-ngx API basics:**
- Base URL: user-configured (e.g., `http://192.168.1.100:8000`)
- Authentication: `Authorization: Token {api_token}`
- REST API: `/api/documents/`, `/api/correspondents/`, `/api/tags/`

**Key endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/documents/` | GET | Search/list documents (supports full-text search) |
| `/api/documents/{id}/` | GET | Document metadata |
| `/api/documents/{id}/thumb/` | GET | Document thumbnail image |
| `/api/documents/{id}/download/` | GET | Download document file |
| `/api/documents/{id}/preview/` | GET | Document preview (PDF viewer) |

### R2: Item Documents Table

```typescript
export const itemDocuments = sqliteTable('item_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  paperlessDocumentId: integer('paperless_document_id').notNull(),
  documentType: text('document_type', { enum: ['receipt', 'warranty', 'manual', 'other'] }).notNull(),
  title: text('title'),
  linkedAt: text('linked_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_item_documents_item').on(table.itemId),
  unique().on(table.itemId, table.paperlessDocumentId),
]);
```

- One item can have multiple documents (receipt + warranty + manual)
- One Paperless document can link to multiple items (bulk purchase receipt)
- `title` cached from Paperless-ngx at link time (avoids API call on every detail page load)
- Unique constraint prevents linking the same document to the same item twice

### R3: Document Search and Linking

**On item detail page → Documents section:**

- "Link Document" button
- Opens search modal:
  - Search input → queries Paperless-ngx API (`/api/documents/?query={search}`)
  - Results show: document title, date, correspondent, tags, thumbnail
  - Document type selector: receipt, warranty, manual, other
  - "Link" button per result
- On link: `inventory.documents.link({ itemId, paperlessDocumentId, documentType, title })`
- Linked document appears immediately in the documents section
- Toast: "Linked [Document Title] as receipt"

### R4: Linked Documents Display

**On item detail page → Documents section:**

- List of linked documents grouped by type:
  - 📄 Receipts
  - 📋 Warranties
  - 📖 Manuals
  - 📎 Other
- Each document shows: title, date linked, thumbnail preview
- Click document → opens Paperless-ngx in a new tab (or inline PDF preview if feasible)
- "Unlink" action per document (removes the link, not the Paperless-ngx document)
- Download button → proxies the file download from Paperless-ngx

### R5: tRPC Router

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `inventory.documents.search` | query | `{ query: string }` | `PaperlessDocument[]` | Search Paperless-ngx documents |
| `inventory.documents.link` | mutation | `{ itemId, paperlessDocumentId, documentType, title }` | `ItemDocument` | Link document to item |
| `inventory.documents.unlink` | mutation | `{ id }` | `void` | Remove link |
| `inventory.documents.listForItem` | query | `{ itemId }` | `ItemDocument[]` | Documents for an item |
| `inventory.documents.getThumbnail` | query | `{ paperlessDocumentId }` | `string (base64 or URL)` | Proxy thumbnail from Paperless-ngx |

### R6: Connection Configuration

**Environment variables:**
- `PAPERLESS_URL` — Paperless-ngx base URL
- `PAPERLESS_API_TOKEN` — API authentication token
- Document in `.env.example`

**tRPC procedures:**
- `inventory.paperless.testConnection` — verify Paperless-ngx is reachable and token is valid
- `inventory.paperless.getConfig` — return connection status

**Graceful degradation:**
- If `PAPERLESS_URL` not set: Documents section hidden on detail page. No error.
- If configured but unreachable: "Paperless-ngx unavailable" message in Documents section. Item detail page still works.

## Out of Scope

- Uploading documents to Paperless-ngx from POPS
- OCR or content extraction
- Auto-matching receipts to items
- Tag management in Paperless-ngx from POPS
- Linking documents to finance transactions (Documents Vault theme)
- Full document viewer within POPS (link out to Paperless-ngx)

## Acceptance Criteria

1. Paperless-ngx client authenticates and searches documents
2. Documents can be searched from within the item detail page
3. Documents can be linked to items with a type (receipt, warranty, manual, other)
4. Linked documents shown on item detail page grouped by type with thumbnails
5. Click document opens Paperless-ngx or downloads the file
6. Documents can be unlinked without affecting Paperless-ngx
7. One document can link to multiple items
8. Duplicate links prevented (same document to same item)
9. Graceful degradation when Paperless-ngx not configured or unreachable
10. `.env.example` updated with `PAPERLESS_URL` and `PAPERLESS_API_TOKEN`
11. Unit tests for API client (mocked responses)
12. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes.

### Batch A — Backend (parallelisable)

#### US-1a: Paperless-ngx HTTP client
**Scope:** Create `modules/inventory/paperless/client.ts`. Auth via `Authorization: Token {PAPERLESS_API_TOKEN}`. Implement: `searchDocuments(query)`, `getDocument(id)`, `getDocumentThumbnail(id)`. Connection test: `GET /api/` with token validation. Typed responses. Unit tests with mocked HTTP (success, 401, 404). `.env.example` updated.
**Files:** `modules/inventory/paperless/client.ts`, `types.ts`, `client.test.ts`

#### US-1b: Item documents schema and router
**Scope:** Create `src/db/schema/item-documents.ts` Drizzle schema per R2. Create tRPC router with: `link({ itemId, paperlessDocumentId, documentType, title })`, `unlink({ id })`, `listForItem({ itemId })`. Unique constraint prevents duplicate links. Generate migration. Unit tests.
**Files:** `src/db/schema/item-documents.ts`, `modules/inventory/documents/router.ts`, service, test

#### US-1c: Thumbnail proxy
**Scope:** Add `getThumbnail` tRPC procedure (or Express route) that proxies the thumbnail from Paperless-ngx. Returns base64 or proxied URL. Caches in memory briefly (5 min) to avoid repeated calls.
**Files:** `modules/inventory/paperless/client.ts` or `modules/inventory/documents/router.ts`

### Batch B — Frontend (parallelisable, depends on Batch A)

#### US-2: Link Document modal
**Scope:** Create `LinkDocumentDialog.tsx`. Search input → queries Paperless-ngx via `inventory.documents.search`. Results show: title, date, correspondent, tags, thumbnail preview. Document type selector (receipt/warranty/manual/other). "Link" button per result. Calls `inventory.documents.link`. Linked document appears immediately. Storybook story.
**Files:** `packages/app-inventory/src/components/LinkDocumentDialog.tsx`, story

#### US-3: Linked documents display on detail page
**Scope:** Add Documents section to `ItemDetailPage`. Shows linked documents grouped by type: 📄 Receipts, 📋 Warranties, 📖 Manuals, 📎 Other. Each: title, linked date, thumbnail. Click → open in Paperless-ngx (new tab). Download button → proxy file download. "Unlink" action. "Link Document" button opens LinkDocumentDialog.
**Files:** `ItemDetailPage.tsx`

#### US-4: Graceful degradation
**Scope:** When `PAPERLESS_URL` not set: Documents section hidden on detail page, no errors. When configured but unreachable: show muted "Paperless-ngx unavailable" message in Documents section. Item detail page works fully without documents. Connection test procedure for settings display.
**Files:** Service layer guards, `ItemDetailPage.tsx` conditional rendering
