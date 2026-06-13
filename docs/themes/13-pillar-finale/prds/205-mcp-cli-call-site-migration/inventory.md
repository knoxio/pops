# PRD-205 inventory: pops-mcp + pops-cli call sites

> PRD: [README.md](README.md)
> Companion to PRD-204's shell inventory. Audit only — no migration in this doc.

## Method

Grepped `apps/pops-mcp/src/` and `apps/pops-cli/src/` for: `trpc.<pillar>.*`, `@pops/api` imports, `@pops/<pillar>-api` imports, direct `getXxxDrizzle()` calls, raw `fetch` against `/trpc/`. Test files (`*.test.ts`, `__tests__/`) excluded — they mock and have to track whatever shape the production code lands on.

Both apps target the mono `pops-api` tRPC surface, but through different transports: `pops-mcp` uses a typed wrapper that imports `@pops/api`'s `AppRouter`, while `pops-cli` rolls its own minimal stringly-typed `fetch` client in `apps/pops-cli/src/api-client.ts` (kept dependency-free so the CLI binary stays small). Neither app uses `pillar()` from `@pops/pillar-sdk` yet — PRD-227 US-03 (the `inventory-locations.ts` canary) is scaffolded but unlanded.

## Rubric (mirrors PRD-204)

| Category | Trigger                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trivial  | Single `getClient().<pillar>.<router>.<proc>` call, no cross-pillar usage, route already lives on its pillar API; swap to `pillar('<id>').<router>.<proc>.orThrow(input)`.                                     |
| Medium   | Same shape but the route is still hosted in the `pops-api` mono today (depends on a writer move) **or** uses mutate-side semantics that need explicit failure mapping to MCP `toolError` / CLI error output.   |
| Risky    | Cross-pillar fan-out from a single tool, callers that thread custom transport behaviour (env-driven URL, auth headers), or shared infrastructure (factory / wrapper) — touching these reshapes every consumer. |

## Already on SDK

Zero. The PRD-227 US-03 canary (`apps/pops-mcp/src/tools/inventory-locations.ts` → `pillar('inventory').locations.*`) is unlanded as of audit. Exclude none from the migration set.

## pops-mcp — shared infrastructure

| File                          | Line | Access                                       | Current shape                                                                                                                                                             | Category |
| ----------------------------- | ---: | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/pops-mcp/src/client.ts` |    3 | `import type { AppRouter } from '@pops/api'` | Single shared `createTRPCClient<AppRouter>` against `${POPS_API_URL}/trpc` with `x-api-key`. Cached module-level singleton consumed by every tool file via `getClient()`. | Risky    |

This file is the linchpin. Every MCP tool below references it. PRD-227 US-03's plan is to introduce a sibling `apps/pops-mcp/src/pillar-client.ts` factory and migrate tool files incrementally — `client.ts` itself only retires once all tool files have moved.

## pops-mcp — tool files

Calls below are `getClient().<pillar>.<router>.<proc>.{query,mutate}(...)`. The "Access" column collapses to the pillar path.

| File                                                  | Line | Access                                     | Op     | Category | Notes                                                                                                     |
| ----------------------------------------------------- | ---: | ------------------------------------------ | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `apps/pops-mcp/src/tools/cerebrum.ts`                 |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/cerebrum.ts`                 |   42 | `cerebrum.engrams.list`                    | query  | Medium   | engrams not in `pops-cerebrum-api` yet (PRD-179 blocker)                                                  |
| `apps/pops-mcp/src/tools/cerebrum.ts`                 |   70 | `cerebrum.engrams.get`                     | query  | Medium   | same blocker                                                                                              |
| `apps/pops-mcp/src/tools/cerebrum.ts`                 |   96 | `cerebrum.retrieval.search`                | query  | Medium   | retrieval not in cerebrum-api yet                                                                         |
| `apps/pops-mcp/src/tools/finance.ts`                  |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/finance.ts`                  |   40 | `finance.transactions.list`                | query  | Trivial  | finance writer move complete; route on `pops-finance-api`                                                 |
| `apps/pops-mcp/src/tools/finance.ts`                  |   71 | `core.entities.list`                       | query  | Risky    | cross-pillar from a `finance.*` tool file — entities live on `core`; the file mixes pillars in one binary |
| `apps/pops-mcp/src/tools/finance.ts`                  |  101 | `finance.budgets.list`                     | query  | Trivial  | finance writer move complete                                                                              |
| `apps/pops-mcp/src/tools/inventory-connections.ts`    |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-connections.ts`    |   22 | `inventory.connections.listForItem`        | query  | Medium   | connections module still in mono (PRD-175 blocker)                                                        |
| `apps/pops-mcp/src/tools/inventory-connections.ts`    |   46 | `inventory.connections.graph`              | query  | Medium   | same blocker                                                                                              |
| `apps/pops-mcp/src/tools/inventory-connections.ts`    |   71 | `inventory.connections.connect`            | mutate | Medium   | same blocker; mutation — needs `toolError` mapping on `unavailable`/`contract-mismatch`                   |
| `apps/pops-mcp/src/tools/inventory-connections.ts`    |   93 | `inventory.connections.disconnect`         | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures.ts`       |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-fixtures.ts`       |   23 | `inventory.fixtures.list`                  | query  | Medium   | fixtures module still in mono                                                                             |
| `apps/pops-mcp/src/tools/inventory-fixtures.ts`       |   44 | `inventory.fixtures.get`                   | query  | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures.ts`       |   64 | `inventory.fixtures.listForItem`           | query  | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |   41 | `inventory.fixtures.create`                | mutate | Medium   | mono blocker + mutation failure mapping                                                                   |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |   73 | `inventory.fixtures.update`                | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |   89 | `inventory.fixtures.delete`                | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |  110 | `inventory.fixtures.connect`               | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-fixtures-write.ts` |  131 | `inventory.fixtures.disconnect`            | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-items.ts`          |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-items.ts`          |   27 | `inventory.items.list`                     | query  | Medium   | items module still in mono                                                                                |
| `apps/pops-mcp/src/tools/inventory-items.ts`          |   51 | `inventory.items.get`                      | query  | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-items-write.ts`    |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-items-write.ts`    |   84 | `inventory.items.create`                   | mutate | Medium   | items mono blocker + mutation failure mapping                                                             |
| `apps/pops-mcp/src/tools/inventory-items-write.ts`    |  150 | `inventory.items.update`                   | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-items-write.ts`    |  166 | `inventory.items.delete`                   | mutate | Medium   | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |   29 | `inventory.locations.tree`                 | query  | Trivial  | route on `pops-inventory-api`; PRD-227 US-03 canary target                                                |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |   39 | `inventory.locations.list`                 | query  | Trivial  | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |   63 | `inventory.locations.create`               | mutate | Trivial  | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |   93 | `inventory.locations.update`               | mutate | Trivial  | same                                                                                                      |
| `apps/pops-mcp/src/tools/inventory-locations.ts`      |  116 | `inventory.locations.delete`               | mutate | Trivial  | same                                                                                                      |
| `apps/pops-mcp/src/tools/media.ts`                    |    1 | `import { getClient } from '../client.js'` | import | —        | shared client wrapper                                                                                     |
| `apps/pops-mcp/src/tools/media.ts`                    |   34 | `media.library.list`                       | query  | Medium   | media writer cutover (Wave 3) blocker                                                                     |
| `apps/pops-mcp/src/tools/media.ts`                    |   61 | `media.watchlist.list`                     | query  | Medium   | same                                                                                                      |

## pops-cli — shared infrastructure

| File                                | Line | Access                                                            | Current shape                                                                                                                                                           | Category |
| ----------------------------------- | ---: | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/pops-cli/src/api-client.ts`   |  122 | raw `fetch` → `${config.apiUrl}/trpc/${procedure}`                | Bespoke dependency-free tRPC HTTP client. Exports `trpcMutation(config, procedure, input)`. Handles `x-api-key` from config. No `query` surface (mutations only today). | Risky    |
| `apps/pops-cli/src/error-output.ts` |    9 | `import { ApiError, ApiUnreachableError } from './api-client.js'` | error type propagation                                                                                                                                                  | —        |

`api-client.ts` is the CLI's analogue to MCP's `client.ts`. It doesn't import `@pops/api` (no type-level coupling — calls are stringly-typed), but the raw URL shape (`/trpc/<procedure>`) and the lack of pillar routing make it the migration target. Replace with `pillar('<id>', { authHeaders }).<router>.<proc>.orThrow(...)`.

## pops-cli — command files

Calls below go through `trpcMutation<T>(config, '<pillar>.<router>.<proc>', input)`.

| File                                             | Line | Access                                            | Op     | Category | Notes                                       |
| ------------------------------------------------ | ---: | ------------------------------------------------- | ------ | -------- | ------------------------------------------- |
| `apps/pops-cli/src/commands/cerebrum-ask.ts`     |    8 | `import { trpcMutation } from '../api-client.js'` | import | —        | bespoke client wrapper                      |
| `apps/pops-cli/src/commands/cerebrum-ask.ts`     |   68 | `cerebrum.query.ask`                              | mutate | Medium   | query module not in `pops-cerebrum-api` yet |
| `apps/pops-cli/src/commands/cerebrum-capture.ts` |    8 | `import { trpcMutation } from '../api-client.js'` | import | —        | bespoke client wrapper                      |
| `apps/pops-cli/src/commands/cerebrum-capture.ts` |   45 | `cerebrum.ingest.quickCapture`                    | mutate | Medium   | ingest module not in cerebrum-api yet       |

## Totals

| Bucket                | Trivial | Medium |               Risky | Total ops |
| --------------------- | ------: | -----: | ------------------: | --------: |
| pops-mcp tool ops     |       7 |     21 |                   1 |        29 |
| pops-mcp shared infra |       — |      — |     1 (`client.ts`) |         1 |
| pops-cli command ops  |       0 |      2 |                   0 |         2 |
| pops-cli shared infra |       — |      — | 1 (`api-client.ts`) |         1 |
| **Total call sites**  |   **7** | **23** |               **3** |    **33** |

Already-on-SDK: **0**. PRD-227 US-03's MCP canary is unlanded.

## Risky tally — quick read

- **`apps/pops-mcp/src/client.ts`** — shared singleton tRPC client across nine tool files. Migration plan (PRD-227 US-03) introduces a sibling `pillar-client.ts` so this file dies last.
- **`apps/pops-mcp/src/tools/finance.ts:71`** — `core.entities.list` from a `finance.*` tool binary. The migration has to either (a) keep a second `pillar('core')` instance in the same file or (b) move the entity-list MCP tool out of `finance.ts` into a `core.ts` tool file. Decide before migration.
- **`apps/pops-cli/src/api-client.ts`** — bespoke `fetch` wrapper. CLI ships as a single binary; `pillar()` carries an HTTP discovery transport, so the CLI either accepts the bundle-size hit or keeps a thin stringly-typed wrapper around `pillar()` to preserve the current `trpcMutation('<id>.<router>.<proc>', input)` surface.

## Migration order suggestion

1. Land `apps/pops-mcp/src/pillar-client.ts` (PRD-227 US-03 acceptance criterion #2). No tool-file changes.
2. Migrate `inventory-locations.ts` (5 Trivial ops, canary).
3. Migrate `finance.ts` Trivial ops (`finance.transactions.list`, `finance.budgets.list`). Park the `core.entities.list` op pending the cross-pillar decision.
4. Wait for the per-pillar writer-move waves (PRD-179 cerebrum, PRD-175 connections, PRD-173/174 items, PRD-165–168 media) to clear the Medium ops.
5. Decide the `finance.ts` cross-pillar split; migrate.
6. Mirror the MCP `pillar-client` pattern into `apps/pops-cli/src/api-client.ts` (or replace with a thin `pillar()` wrapper).
7. Retire `apps/pops-mcp/src/client.ts` and `apps/pops-cli/src/api-client.ts` once every call site is on SDK.
