# PRD-008: API Server

> Epic: [03 — API Server](../../epics/03-api-server.md)
> Status: Done

## Overview

Build `pops-api` — a single Express + tRPC server with domain-grouped router modules. Each domain (core, finance, media, inventory) gets its own router module composed into the top-level `appRouter`. Middleware handles auth, rate limiting, and error handling. One server, one database, one deployment.

## Server Structure

```
apps/pops-api/
  package.json
  tsconfig.json
  src/
    app.ts                  (Express app setup, middleware stack)
    server.ts               (HTTP server startup)
    router.ts               (top-level tRPC appRouter composition)
    modules/
      core/
        entities/           (shared across all domains)
        health/             (health check endpoint)
        ai-usage/           (platform-level AI cost tracking)
        corrections/        (learned tagging rules)
        envs/               (test environment management)
        index.ts            (core sub-router)
      finance/
        transactions/
        budgets/
        imports/
        wishlist/
        index.ts            (finance sub-router)
      inventory/
        items/
        locations/
        connections/
        photos/
        documents/
        index.ts            (inventory sub-router)
      media/
        movies/
        tv-shows/
        watchlist/
        watch-history/
        comparisons/
        tmdb/
        thetvdb/
        plex/
        arr/
        discovery/
        index.ts            (media sub-router)
    middleware/
      auth.ts               (Cloudflare JWT validation)
      rate-limit.ts
      error-handler.ts
      env-context.ts        (environment scoping)
    routes/
      webhooks.ts           (Express routes for Up Bank webhooks, etc.)
    db/
      schema.ts             (SQLite schema initialisation)
      migrations/           (SQL migration files)
```

### Module Pattern

Every module follows the same structure:

```
modules/<domain>/<feature>/
  router.ts               (tRPC procedures)
  service.ts              (business logic)
  types.ts                (domain types)
  *.test.ts               (unit tests)
```

### Router Composition

```typescript
// src/router.ts
export const appRouter = router({
  core: coreRouter, // core.entities.list, core.aiUsage.list
  finance: financeRouter, // finance.transactions.list, finance.budgets.list
  inventory: inventoryRouter, // inventory.items.list, inventory.locations.tree
  media: mediaRouter, // media.movies.list, media.comparisons.submit
});
```

Each domain group exports a composed sub-router from its `index.ts`.

### tRPC Procedure Paths

| Domain      | Example procedures                                                                |
| ----------- | --------------------------------------------------------------------------------- |
| `core`      | `core.entities.list`, `core.aiUsage.list`, `core.corrections.list`                |
| `finance`   | `finance.transactions.list`, `finance.budgets.create`, `finance.imports.upload`   |
| `inventory` | `inventory.items.list`, `inventory.locations.tree`, `inventory.connections.trace` |
| `media`     | `media.movies.search`, `media.comparisons.submit`, `media.plex.sync`              |

## Module Import Rules

- Any module can import from `core/` (entities, shared utilities)
- Domain modules **cannot** import from each other directly
- Cross-domain queries go through `core/` or a dedicated cross-domain layer
- Each module exports a tRPC router, composed at domain level, then at app level

## Middleware Stack

| Middleware         | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `auth.ts`          | Validates Cloudflare Access JWT tokens              |
| `rate-limit.ts`    | Rate limiting per endpoint                          |
| `error-handler.ts` | Consistent error responses, logging                 |
| `env-context.ts`   | Scopes requests to named environments (for testing) |

## Express Routes (non-tRPC)

Some endpoints don't fit the tRPC model:

- `/health` — health check (no auth)
- `/webhooks/up` — Up Bank webhook receiver (validates `X-Up-Authenticity-Signature`)
- `/media/images/:type/:id/:filename` — static image serving for cached posters

## Business Rules

- One server, one process, one SQLite database — no microservices
- tRPC for all client-facing procedures — type-safe end-to-end
- Express routes for webhooks and static file serving only
- Parameterised queries only — no string interpolation into SQL
- No cross-domain module imports — enforced by convention and review

## Edge Cases

| Case                                  | Behaviour                                                           |
| ------------------------------------- | ------------------------------------------------------------------- |
| Health check                          | No auth required, returns `{ status: "ok" }`                        |
| Up webhook                            | Validates signature header, re-fetches transaction from Up API      |
| New domain module                     | Create `modules/<domain>/`, add sub-router, register in `router.ts` |
| Module needs data from another domain | Import from `core/` service, not from the other domain directly     |

## User Stories

| #   | Story                                                   | Summary                                                                                                      | Status | Parallelisable   |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | ---------------- |
| 01  | [us-01-express-trpc-setup](us-01-express-trpc-setup.md) | Set up Express app with tRPC adapter, health endpoint                                                        | Done   | No (first)       |
| 02  | [us-02-module-pattern](us-02-module-pattern.md)         | Establish the module pattern (router/service/types/tests) with core/entities as the reference implementation | Done   | Blocked by us-01 |
| 03  | [us-03-middleware](us-03-middleware.md)                 | Build middleware stack: auth, rate limiting, error handling, env context                                     | Done   | Blocked by us-01 |
| 04  | [us-04-router-composition](us-04-router-composition.md) | Compose domain sub-routers into the top-level appRouter                                                      | Done   | Blocked by us-02 |
| 05  | [us-05-webhook-routes](us-05-webhook-routes.md)         | Set up Express routes for webhooks and static file serving                                                   | Done   | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01. US-04 depends on US-02. US-05 can parallelise with US-02/US-03.

## Verification

- `pnpm dev:api` starts the API server
- `/health` returns `{ status: "ok" }`
- tRPC procedures are accessible from the shell via proxy
- All module tests pass
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass
- Adding a new domain module requires only: create directory, export router, register in `router.ts`

## Out of Scope

- Domain-specific business logic (each theme owns its modules)
- Database schema (PRD-009)
- Deployment configuration (Infrastructure theme)

## Drift Check

last checked: 2026-04-17
