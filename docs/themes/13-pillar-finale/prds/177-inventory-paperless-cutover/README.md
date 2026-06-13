# PRD-177: inventory.paperless cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)
>
> **Status: Done (no work required).** The slice has no data of its own — see [Investigation](#investigation) below.

## Overview

The `inventory.paperless.*` surface is a thin tRPC router over an outbound HTTP
client to the paperless-ngx container. It owns **zero tables** in `pops.db` (or
anywhere else). There is nothing to migrate to `inventory.db`, so the canonical
4-PR N-track sequence does not apply.

This PRD is preserved as a documented no-op so the epic's slice list stays
complete and future readers don't reopen the question.

## Investigation

Surveyed `apps/pops-api/src/modules/inventory/paperless/` (2026-06-13):

| File             | Role                                                       |
| ---------------- | ---------------------------------------------------------- |
| `client.ts`      | Typed wrapper over the paperless-ngx REST API (HTTP only). |
| `types.ts`       | Raw + mapped API types. No DB rows.                        |
| `index.ts`       | `getPaperlessClient()` factory; feature-toggle gated.      |
| `router.ts`      | `status` + `search` procedures. Calls the client only.     |
| `client.test.ts` | Unit tests with mocked `fetch`.                            |

Grep results that confirm the no-DB picture:

- `paperless_sync_state` — does not exist anywhere in the repo.
- `paperless_document_cache` — does not exist anywhere in the repo.
- No `getInventoryDrizzle` / `getInventoryDb` / shared-journal import in
  `paperless/`.
- The only `paperless`-named DB column is `item_documents.paperless_document_id`
  — a foreign-id integer owned by **PRD-176** (`inventory.documents`), not by
  this slice.

The actual wire surface today is:

| Procedure                    | Kind  | Behaviour                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory.paperless.status` | query | Returns `{ data: { configured: boolean, available: boolean, baseUrl: string \| null } }`. `baseUrl` is `null` when the `inventory.paperless` feature flag is off or the `PAPERLESS_BASE_URL` / `PAPERLESS_API_TOKEN` env vars are missing — in that case `configured` and `available` are both `false`. Reachability is probed by hitting `/api/document_types/`. |
| `inventory.paperless.search` | query | Forwards `query` to paperless `/api/documents/?query=…`.                                                                                                                                                                                                                                                                                                          |

The PRD's original API table — `sync`, `getDocument`, `tags.list` — was
aspirational. None of those procedures exist.

### PRD discrepancy

The original PRD-177 listed two tables (`paperless_sync_state`,
`paperless_document_cache`) and four procedures (`sync`, `search`,
`getDocument`, `tags.list`). None of them exist in the live module. Two
interpretations:

1. They were planned but never built — pops never cached paperless metadata
   locally; every read goes straight to paperless-ngx.
2. They were copy-paste from the canonical PRD-165 template without a fact
   check.

Either way, the live shape is "outbound HTTP only". Nothing to cut over.

## Decision

**No PRs to ship.** The slice is complete-by-construction:

- Container boundary: `pops-api` → `pops-paperless` (HTTP) is unchanged by the
  per-pillar DB split. The client cares about env vars (`PAPERLESS_BASE_URL`,
  `PAPERLESS_API_TOKEN`), not about which sqlite file owns inventory rows.
- No shared-journal entries to drop (PR2-equivalent is a no-op).
- No router handle to flip (PR3-equivalent is a no-op).
- No shim to delete (PR4-equivalent is a no-op).

If a future feature adds local paperless state (e.g. cached metadata, sync
cursor, per-user subscriptions), that work goes in a **new** PRD scoped to
those tables — not in PRD-177.

## Out of Scope

- Refactoring `PaperlessClient` (no behaviour change desired).
- Adding a paperless metadata cache (would need its own PRD).
- Multi-tenant paperless / per-user paperless instances.
- Any feature work on the inventory.documents <-> paperless link — owned by
  PRD-176.
