# Epic: API Modularisation

**Theme:** Foundation
**Priority:** 3
**Status:** Not started

## Goal

Rename `apps/finance-api/` to `apps/pops-api/`. Restructure modules into domain groupings. Promote entities to `core/`. Establish the pattern for adding new domain modules.

## Scope

### In scope

- Rename `apps/finance-api/` → `apps/pops-api/`, `@pops/finance-api` → `@pops/api`
- Create `core/` module group:
  - `core/entities/` — promoted from finance (shared across all future domains)
  - `core/health/` — health check endpoint (already exists)
  - `core/auth/` — placeholder for shared auth middleware
- Create `finance/` module group:
  - `finance/transactions/`
  - `finance/budgets/`
  - `finance/imports/`
  - `finance/wishlist/`
- Move `inventory/` to its own domain group (already partially exists)
- Move `ai-usage/` to `core/` (platform-level concern)
- Move `corrections/` to `core/` (used by import pipeline, will be cross-domain)
- Update tRPC router composition
- Update all tRPC client references in `@pops/app-finance`
- Update Docker, deployment, mise tasks, CI

### Out of scope

- New API endpoints
- Database schema changes
- New domain modules (media, fitness, etc.)

## Deliverables

1. `apps/pops-api/` exists, `apps/finance-api/` is deleted
2. Module structure follows the domain grouping pattern from ADR-003
3. Entities are in `core/` and accessible to all future domain modules
4. All existing API tests pass
5. All E2E tests pass
6. Docker, mise tasks, and CI updated

## Target Structure

```
apps/pops-api/src/modules/
  core/
    entities/        (service, router, types)
    health/
    auth/
    ai-usage/
    corrections/
  finance/
    transactions/
    budgets/
    imports/
    wishlist/
  inventory/
    items/
```

## Module Import Rules

- Any module can import from `core/`
- Domain modules (finance, inventory, etc.) CANNOT import from each other
- Cross-domain queries go through `core/` or a dedicated query layer
- Each module exports a tRPC router, composed at the app level

## Dependencies

- Epic 2 (Shell Extraction) — should be done first so frontend references are already on `@pops/app-finance` and the import path changes are isolated

## Risks

- **tRPC router path changes** — Renaming modules changes the tRPC procedure paths (e.g., `transactions.list` → `finance.transactions.list`). Frontend calls need updating.
- **Docker image name changes** — `finance-api` image name used in docker-compose and Ansible. All references need updating.
