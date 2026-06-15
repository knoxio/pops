# PRD-249: `cerebrum.embeddings.*` (read-only) cross-pillar SDK surface (unblock core → cerebrum embeddings burn-down)

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)
>
> Status: **Done** — closes [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 1 (`apps/pops-api/src/modules/core/embeddings/service.ts`).

## Overview

[PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 1 is the smallest of the H8 cross-pillar burn-down entries: one file, `apps/pops-api/src/modules/core/embeddings/service.ts`, reaches into `@pops/cerebrum-db`'s `embeddings` table to compute coverage stats and to enumerate source ids of a given type. PRD-246's "Out of Scope" forbids the SDK shape: _"No new SDK type machinery."_ `pops-cerebrum-api`'s `cerebrumRouter` does not expose any embeddings procedure today.

PRD-249 is the scoping PRD for the **read-only** `cerebrum.embeddings.*` surface: `getStatus` and `listSourceIdsByType`. The surface is deliberately small — only the two methods that Site 1 needs — because:

- The core-embeddings orchestrator is a cross-pillar reader of cerebrum-owned aggregate data, not a writer. Writes to the `embeddings` table happen entirely within cerebrum (via the embedding worker); core does not own that flow.
- A larger embeddings surface (knn search, vector inserts, etc.) belongs to the cerebrum-internal pillar and does not need cross-pillar exposure.

PRD-249 builds on PRD-247's server-side `pillar('<other>').*` consumer pattern ([server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md)). It is structurally identical to PRD-247 minus writes and the bulk-shape concern.

## Background

### The single blocked call site

`apps/pops-api/src/modules/core/embeddings/service.ts` calls into `@pops/cerebrum-db`'s `embeddings` drizzle table for exactly two read patterns:

| Function in `service.ts`                                              | Drizzle pattern                                                                                                                    | Purpose                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `getEmbeddingStatus(sourceType?)` (line 117)                          | `select({ count: sql<number>\`count(\*)\` }).from(embeddings)`optionally filtered by`where(eq(embeddings.sourceType, sourceType))` | Coverage stats — total embedded count by source type.               |
| `reindexEmbeddings(sourceType, sourceIds?)` (line 137, `else` branch) | `selectDistinct({ sourceId: embeddings.sourceId }).from(embeddings).where(eq(embeddings.sourceType, sourceType))`                  | Enumerate all distinct source ids for a type when no list is given. |

Both are pure aggregate reads. Neither writes; neither runs inside a transaction with anything else.

The `semanticSearch` function on line 92 of the same file uses the `vec0` virtual table via `runKnnQuery` — that is a different code path that does not import `@pops/cerebrum-db`'s drizzle objects, so it is **not** part of this PRD.

### Surface inventory (the 2 methods)

| Method                                | Direction | Site(s) consumed by                               | Notes                                                                                               |
| ------------------------------------- | --------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `getStatus({ sourceType? })`          | Read      | `core/embeddings/service.ts` `getEmbeddingStatus` | Returns `{ total, pending, stale }`. Today `pending`/`stale` are hard-coded 0 (see service.ts:128). |
| `listSourceIdsByType({ sourceType })` | Read      | `core/embeddings/service.ts` `reindexEmbeddings`  | Returns `{ sourceIds: string[] }`. Distinct source ids for a given source type.                     |

`getStatus`'s shape preserves today's `{ total, pending, stale }` return; the `pending`/`stale` fields remain 0 (the service note explicitly says callers that track pending state should implement per-source queries — PRD-249 does not change that). A future PRD can plumb real `pending`/`stale` counts in if a consumer needs them.

## Surface

| Surface                                                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-cerebrum-api/src/modules/embeddings/router.ts` (new)                                   | Mount `embeddings.{getStatus, listSourceIdsByType}` on `cerebrumRouter`. Read-only. Implementation queries `getCerebrumDrizzle()`'s `embeddings` table directly (analogous to the existing in-monolith code in `core/embeddings/service.ts`, but the cerebrum-api now owns the cerebrum-side read).                                                                                                            |
| `apps/pops-cerebrum-api/src/router.ts`                                                            | `cerebrumRouter` adds `embeddings: embeddingsRouter`. Procedure paths become `cerebrum.embeddings.*`.                                                                                                                                                                                                                                                                                                          |
| `packages/contracts-cerebrum/src/...` (per [PRD-153](../153-contract-package-scaffold/README.md)) | Generated contract package picks up the new procedures. Typed proxy `pillar<CerebrumRouter>('cerebrum').embeddings.*` resolves at the type level.                                                                                                                                                                                                                                                              |
| `apps/pops-api/src/modules/core/embeddings/service.ts`                                            | Flip `db.select(...).from(embeddings)...` → `await pillar('cerebrum').embeddings.getStatus(...)` and `pillar('cerebrum').embeddings.listSourceIdsByType(...)`. Functions that wrap these reads (`getEmbeddingStatus`, `reindexEmbeddings`) become `async`. The `import { embeddings } from '@pops/cerebrum-db'` runtime import is dropped. Matching `.dependency-cruiser-known-violations.json` entry removed. |

### Wire shape

- **`getStatus({ sourceType? })`** — zod input `{ sourceType?: string }`. Output `{ total: number, pending: number, stale: number }`. `pending` and `stale` remain `0` (matching the service.ts:128 note about per-source tracking being out of scope).
- **`listSourceIdsByType({ sourceType })`** — zod input `{ sourceType: string }`. Output `{ sourceIds: string[] }`. The list can be large; consider whether a paginated shape is needed at PR time. For the current call site (`reindexEmbeddings` iterates over all ids in a `for` loop), an unbounded array is acceptable but US-02 must verify size + add `limit?` if the worker hot-path demands it.

## Business Rules

- **Read-only surface.** No procedures mutate state. Writes to the `embeddings` table are owned by the cerebrum-internal embedding worker; cross-pillar callers have no business writing.
- **Inherits PRD-247 conventions.** Async signatures, `PillarCallError` discrimination, service-account auth, discovery-cache. See [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md).
- **`listSourceIdsByType` is `SELECT DISTINCT`-shaped.** Matches today's `selectDistinct(...)` semantics. Order is unspecified; callers do not assume sorted output.
- **`getStatus.pending` / `getStatus.stale` are placeholders.** They return 0 today (per `service.ts:128`). PRD-249 preserves that shape; a future PRD adds real counts if a consumer needs them.
- **No knn / semantic-search exposure.** The `semanticSearch` path stays in-pillar (it uses the `vec0` virtual table and the orchestration belongs to whichever pillar owns the AI workflow). PRD-249 does not promote it.

## Edge Cases

| Case                                                            | Behaviour                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cerebrum-api` is unavailable                                   | `pillar('cerebrum').embeddings.getStatus(...)` throws `PillarCallError` with `kind: 'pillar-unavailable'`. The core-embeddings orchestrator surfaces the error to the caller; no fallback to a direct `@pops/cerebrum-db` read.                                                          |
| `getStatus({ sourceType: '<unknown>' })`                        | Returns `{ total: 0, pending: 0, stale: 0 }`. Not an error; an unknown source type is simply not present in the table.                                                                                                                                                                   |
| `listSourceIdsByType({ sourceType })` returns a very large list | The wire response is bounded only by HTTP body limits. If the table grows large enough that this matters, US-02 adds `{ limit?, cursor? }` paginated shape and the consumer (`reindexEmbeddings`) consumes the cursor. Verify list size at PR time (likely <10k rows; if not, paginate). |
| The `embeddings` table is empty                                 | `getStatus` returns `{ total: 0, pending: 0, stale: 0 }`. `listSourceIdsByType` returns `{ sourceIds: [] }`. No errors.                                                                                                                                                                  |
| The `vec` SQLite extension is unavailable                       | The `vec0` virtual table is unrelated to PRD-249's surface (PRD-249 reads only the relational `embeddings` table, which exists regardless of `vec`). `getStatus` / `listSourceIdsByType` work even with `vec` disabled.                                                                  |

## User Stories

| #   | Story                                                                           | Summary                                                                                                                                                                                                     | Parallelisable   | Status |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| 01  | [us-01-schema-and-types](us-01-schema-and-types.md)                             | Promote zod input/output schemas + TypeScript types for `getStatus` and `listSourceIdsByType` to `@pops/cerebrum-contract`. OpenAPI snapshot updated. No router code.                                       | Foundational     | Done   |
| 02  | [us-02-embeddings-read-router](us-02-embeddings-read-router.md)                 | Mount `embeddings.{getStatus, listSourceIdsByType}` on `pops-cerebrum-api`'s `cerebrumRouter`, binding the US-01 schemas. Read-only.                                                                        | Blocked by US-01 | Done   |
| 03  | [us-03-core-embeddings-call-site-flip](us-03-core-embeddings-call-site-flip.md) | Flip `apps/pops-api/src/modules/core/embeddings/service.ts` from `db.select(...).from(embeddings)` to `await pillar('cerebrum').embeddings.*`. Wrapping functions become `async`. Allow-list entry removed. | Blocked by US-02 | Done   |
| 04  | [us-04-integration-test](us-04-integration-test.md)                             | End-to-end test boots cerebrum-api + pops-api, exercises the two read endpoints, asserts shape + unavailable behaviour.                                                                                     | Blocked by US-02 | Done   |

US-01 (schema-and-types) is foundational. US-02 (router) blocks on US-01. US-03 (consumer flip) and US-04 (integration test) both block on US-02 and can land in parallel after it.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `pops-cerebrum-api`'s `cerebrumRouter` exposes `embeddings.{getStatus, listSourceIdsByType}` with zod-validated inputs / outputs.
- The contract package emits typed procedure handles for `pillar<CerebrumRouter>('cerebrum').embeddings.*`.
- `apps/pops-api/src/modules/core/embeddings/service.ts` contains no runtime `@pops/cerebrum-db` import (type-only is allowed for any shared enum). `getEmbeddingStatus` and `reindexEmbeddings` are `async` and use the SDK.
- Matching `.dependency-cruiser-known-violations.json` entry removed.
- Integration test boots both APIs and asserts wire-level reads + the unavailable-pillar discriminant.
- `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build`, `pnpm --filter @pops/pops-api typecheck/test/build`, and monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Cross-pillar embedding writes.** The embedding worker owns writes inside cerebrum. No cross-pillar `insert` / `update` / `delete` is exposed.
- **`semanticSearch` cross-pillar exposure.** The `vec0`-based knn path stays in-pillar. If a future consumer needs cross-pillar semantic search, it gets its own PRD with the orchestration question scoped explicitly.
- **Real `pending` / `stale` counts in `getStatus`.** Today they are placeholder zeros (per `service.ts:128`). PRD-249 preserves the shape; real values are a successor concern when a consumer needs them.
- **Pagination on `listSourceIdsByType`.** Out of scope unless the table size at PR time makes it necessary. US-02 verifies and pages if required.
- **A first-class `usePillarEmbeddings('cerebrum')` React hook.** PRD-249 is server-only. Front-end consumers (if any) go through `usePillarQuery('cerebrum', ['embeddings', 'getStatus'], …)` per PRD-244.

## References

- [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 1 — the consumer this surface unblocks
- [PRD-247](../247-core-settings-sdk-surface/README.md) — sibling cross-pillar SDK PRD; ships the consumer-pattern doc
- [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) — sibling cross-pillar SDK PRD (cerebrum write surface)
- [PRD-242](../242-dynamic-approuter/README.md) — typed `pillar()` proxy
- [PRD-153](../153-contract-package-scaffold/README.md) — contract-package scaffold
- [PRD-156](../156-consumer-import-discipline/README.md) — gates new H8 violations
- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md)
- [ADR-027 — Runtime pillar registry](../../../../architecture/adr-027-runtime-pillar-registry.md)
- [Server pillar SDK consumer pattern](../../notes/server-pillar-sdk-consumer-pattern.md) — async / error / auth conventions inherited from PRD-247 US-02
- [Pillar isolation audit](../../notes/pillar-isolation-audit.md) §H8 — Site 1
- `apps/pops-api/src/modules/core/embeddings/service.ts` — the one call site this surface unblocks (lines 117–158)
- `apps/pops-cerebrum-api/src/router.ts` — where the new `embeddingsRouter` mounts
