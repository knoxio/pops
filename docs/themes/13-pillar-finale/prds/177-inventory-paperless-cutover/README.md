# PRD-177: inventory.paperless cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `inventory.paperless.*` procedures (the paperless-ngx client + sync state) into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The paperless surface bridges pops to the paperless-ngx container. Holds sync state, cached document metadata, and the API client. Outbound HTTP to `pops-paperless`; the client itself is stateless.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `paperless_sync_state` — { id, last_synced_at, last_document_id, status }
- `paperless_document_cache` — { document_id, title, tags_json, correspondent, file_type, cached_at } (denormalised cache of paperless metadata; refreshed on sync)

## API Surface

| Procedure                         | Kind                             |
| --------------------------------- | -------------------------------- |
| `inventory.paperless.sync`        | mutation (calls paperless API)   |
| `inventory.paperless.search`      | query (against cache + live API) |
| `inventory.paperless.getDocument` | query                            |
| `inventory.paperless.tags.list`   | query                            |

Files today: `apps/pops-api/src/modules/inventory/paperless/{client.ts, router.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Paperless HTTP client (`client.ts`) is decoupled from DB; outbound calls work identically post-cutover.
- The cache table is reconstructible from paperless API; if backfill is lossy, next sync re-populates.

## Edge Cases

| Case                                       | Behaviour                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Paperless container is down during cutover | Cutover is a DB-only change; paperless reachability irrelevant.           |
| Cache is stale (cached_at > 1 day)         | Existing TTL refresh logic preserved.                                     |
| Sync mid-cutover                           | Worker / sync calls use the active handle; PR 3 lands all writes at once. |

## User Stories

| #   | Story                                                       | Summary                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------ |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + service in `@pops/inventory-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                  |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getInventoryDrizzle()`    |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                      |

## Out of Scope

- Paperless API client refactoring.
- New paperless features (e.g. tag rules).
- Multi-tenant paperless.
