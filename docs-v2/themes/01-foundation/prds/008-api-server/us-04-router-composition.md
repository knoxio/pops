# US-04: Compose domain sub-routers

> PRD: [008 — API Server](README.md)
> Status: Done

**GH Issue:** #417

## Audit Findings

**Present:**
- `src/router.ts` exports `appRouter` composed as `{ core, finance, inventory, media }` with a JSDoc comment explaining the domain structure
- All four domains have `index.ts` files composing their feature routers: `core/index.ts` (entities, ai-usage, corrections), `finance/index.ts` (transactions, budgets, imports, wishlist), `inventory/index.ts`, `media/index.ts`
- Procedure paths are namespaced (e.g., `core.entities.list`, `finance.transactions.list`)
- `AppRouter` type exported from `router.ts` and imported by the frontend in `apps/pops-shell/src/lib/trpc.ts` (`createTRPCReact<AppRouter>()`)
- Pattern for adding new domains is self-evident: create `modules/<domain>/index.ts`, add to `router.ts`

## Description

As a developer, I want domain sub-routers composed into a single top-level appRouter so that procedure paths reflect domain ownership and new domains are easy to add.

## Acceptance Criteria

- [x] `src/router.ts` exports `appRouter` composed as `{ core, finance, inventory, media }`
- [x] Each domain has an `index.ts` that composes its feature routers into a domain sub-router
- [x] Procedure paths are namespaced: `trpc.finance.transactions.list`, `trpc.core.entities.list`
- [x] `AppRouter` type is exported for the frontend tRPC client
- [x] TypeScript catches any broken procedure references in the frontend
- [x] Adding a new domain requires: create `modules/<domain>/index.ts`, add to `router.ts`

## Notes

The composition is two levels: features compose into domain routers, domain routers compose into the app router. This keeps each level small and focused.
