# PRD-004: API Modularisation

**Epic:** [03 — API Modularisation](../themes/foundation/epics/03-api-modularisation.md)
**Theme:** Foundation
**Status:** Approved
**ADRs:** [003 — Component Library & API](../architecture/adr-003-component-library-and-api.md)
**Depends on:** PRD-002 (shell extraction — frontend already on `@pops/app-finance` so import changes are isolated)

## Problem Statement

The backend is named `finance-api` and has a flat module structure — entities, transactions, budgets, inventory, ai-usage, and corrections all sit as siblings. As POPS expands to media, fitness, travel, etc., this structure won't convey which modules belong to which domain. Entities are currently finance-scoped but need to be platform-level.

## Goal

Rename to `pops-api`, restructure modules into domain groups, promote shared modules to `core/`, and establish the pattern for adding new domain modules.

## Requirements

### R1: Rename Package

- `apps/finance-api/` → `apps/pops-api/`
- `@pops/finance-api` → `@pops/api`
- Update all references: shell's tRPC AppRouter import, pnpm workspace, Turbo, mise, Docker, nginx, Ansible, CLAUDE.md

### R2: Module Restructure

**Current:**
```
src/modules/
  ai-usage/
  budgets/
  corrections/
  entities/
  envs/
  imports/
  inventory/
  transactions/
  wishlist/
```

**Target:**
```
src/modules/
  core/
    entities/          (promoted — shared across all domains)
    health/            (existing health endpoint, formalised)
    ai-usage/          (platform-level concern)
    corrections/       (used by import pipeline, will be cross-domain)
    envs/              (test environment management)
    index.ts           (barrel export for core router)
  finance/
    transactions/
    budgets/
    imports/
    wishlist/
    index.ts           (barrel export for finance router)
  inventory/
    items/             (existing inventory module)
    index.ts
```

### R3: Router Composition

**Current** (`src/router.ts`):
```typescript
export const appRouter = router({
  aiUsage: aiUsageRouter,
  budgets: budgetsRouter,
  corrections: correctionsRouter,
  entities: entitiesRouter,
  imports: importsRouter,
  inventory: inventoryRouter,
  transactions: transactionsRouter,
  wishlist: wishlistRouter,
})
```

**Target:**
```typescript
export const appRouter = router({
  core: coreRouter,           // core.entities.list, core.aiUsage.list, etc.
  finance: financeRouter,     // finance.transactions.list, finance.budgets.list, etc.
  inventory: inventoryRouter, // inventory.items.list, etc.
})
```

Each domain group exports a composed sub-router from its `index.ts`.

### R4: tRPC Procedure Path Changes

This changes every tRPC procedure path. Frontend calls must be updated:

| Current | New |
|---------|-----|
| `trpc.transactions.list` | `trpc.finance.transactions.list` |
| `trpc.budgets.list` | `trpc.finance.budgets.list` |
| `trpc.wishlist.list` | `trpc.finance.wishlist.list` |
| `trpc.imports.upload` | `trpc.finance.imports.upload` |
| `trpc.entities.list` | `trpc.core.entities.list` |
| `trpc.aiUsage.list` | `trpc.core.aiUsage.list` |
| `trpc.corrections.list` | `trpc.core.corrections.list` |
| `trpc.inventory.list` | `trpc.inventory.items.list` |

All references in `@pops/app-finance` pages need updating. tRPC provides type safety — if a path changes, TypeScript will flag every broken call.

### R5: Module Import Rules

Enforced by convention (and PR review):

- Any module can import from `core/`
- Domain modules (finance, inventory, etc.) CANNOT import from each other
- Cross-domain queries go through `core/` or a dedicated query layer
- Each module exports a tRPC router, composed at the domain level, then at the app level

### R6: Infrastructure Updates

- Docker image name: `finance-api` → `pops-api`
- `docker-compose.yml`: service name, build context, image name
- Ansible templates: any references to `finance-api`
- nginx proxy config: likely unchanged (proxies `/trpc` regardless of backend name)
- mise tasks: `dev:api`, `test:api`, etc.
- CLAUDE.md: all references

## Out of Scope

- New API endpoints or procedures
- Database schema changes (that's PRD-005)
- New domain modules (media, fitness, etc.)
- Auth middleware implementation (placeholder only)
- Changing the database layer or connection management

## Acceptance Criteria

1. `apps/pops-api/` exists, `apps/finance-api/` deleted
2. Modules structured into `core/`, `finance/`, `inventory/` groups
3. Entities, ai-usage, corrections, envs in `core/`
4. tRPC router composed as nested domain routers
5. All frontend tRPC calls updated to new paths
6. Module import rules followed — no cross-domain imports
7. All API unit tests pass
8. All E2E tests pass
9. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass
10. Docker, mise, Ansible, CLAUDE.md updated
11. Zero references to `finance-api` remain (except git history)

## Edge Cases & Decisions

**Q: Does the health endpoint need its own module?**
A: Yes — it's a standard pattern. `core/health/` exports a simple router with a health check procedure. Keep it minimal.

**Q: Auth module — what goes in it?**
A: Placeholder only. An `index.ts` with a comment describing where CF Access JWT validation middleware will live. The actual middleware already exists in `src/middleware/` — it doesn't need to move yet, just needs a future home documented.

**Q: What about the `imports/lib/` and `imports/transformers/` subdirectories?**
A: They move with imports into `finance/imports/`. The entity-matcher in `imports/lib/` imports from `core/entities/` service — that's a valid cross-domain reference (domain → core).

**Q: Will the Moltbot finance skill break?**
A: Check if Moltbot references the API by package name or by HTTP endpoint. If by HTTP endpoint (`/trpc`), no change needed. If by package name, update it.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Rename package and restructure modules
**As a** developer, **I want** the API renamed to `pops-api` with modules grouped by domain **so that** the codebase reflects the multi-domain architecture.

**Acceptance criteria:**
- `apps/pops-api/` exists with all source code
- `apps/finance-api/` deleted
- Modules in `core/`, `finance/`, `inventory/` groups
- Package name is `@pops/api`
- All internal imports resolve correctly

### US-2: Update tRPC router composition and frontend calls
**As a** developer, **I want** the tRPC router nested by domain **so that** procedure paths reflect their domain ownership.

**Acceptance criteria:**
- `appRouter` composed as `{ core, finance, inventory }`
- All frontend tRPC calls in `@pops/app-finance` updated to new paths
- Shell's `AppRouter` type import updated to `@pops/api`
- TypeScript catches any missed path changes

### US-3: Update infrastructure and documentation
**As a** developer, **I want** all tooling and deployment references updated **so that** the rename is complete end-to-end.

**Acceptance criteria:**
- Docker image/service name updated
- docker-compose.yml updated
- mise tasks updated
- Ansible templates updated
- CLAUDE.md updated
- All E2E tests pass
- Zero references to `finance-api` remain in repo
