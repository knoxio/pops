# Epic: Shell Extraction

**Theme:** Foundation
**Priority:** 2
**Status:** Done

## Goal

Extract the shared shell (layout, routing, app switcher, theming, tRPC provider) from `apps/pops-pwa/` into `apps/pops-shell/`. Convert `pops-pwa` into `packages/app-finance/` as the first app package. The shell becomes the single entry point that lazily loads app packages.

## Scope

### In scope

- Create `apps/pops-shell/` with:
  - `main.tsx` entry point
  - Root layout (TopBar, Sidebar → App Switcher)
  - React Router config with lazy-loaded app routes
  - tRPC client provider
  - React Query provider
  - Theme provider (Zustand store)
  - Vite config (replaces pops-pwa's)
  - Tailwind entry point (imports from `@pops/ui`)
- Create `packages/app-finance/` with:
  - All finance pages (Dashboard, Transactions, Budgets, Entities, Wishlist, AiUsage, Import)
  - Finance-specific components (ImportWizard, TagEditor, TransactionCard, etc.)
  - Finance-specific stores (importStore)
  - Exported route definitions
  - Finance-specific stories
- Transform Sidebar into App Switcher:
  - Top-level: app icons/names (Finance, and later Media, Inventory, etc.)
  - Second-level: pages within the active app
- Remove `apps/pops-pwa/` once extraction is complete
- Update Docker, nginx, and deployment configs to point to pops-shell

### Out of scope

- Building any new app
- Changing the API (that's epic 3)
- New UI components
- Responsive design audit (that's epic 5)

## Deliverables

1. `apps/pops-shell/` is the single frontend entry point
2. `packages/app-finance/` contains all finance pages and domain components
3. App switcher shows Finance as the sole app (more added later)
4. Navigation within Finance works exactly as before
5. Lazy loading works — finance routes are code-split
6. `pnpm dev` starts one Vite server serving the shell
7. `pnpm build` produces one output bundle with code splitting
8. All E2E tests pass
9. `apps/pops-pwa/` is deleted

## Migration Strategy

This is a rename-and-reorganise, not a rewrite:

1. Create `apps/pops-shell/` with minimal config
2. Create `packages/app-finance/` and move finance pages + domain components
3. Wire up shell → app-finance route imports
4. Move providers (tRPC, React Query, theme) into shell
5. Transform Sidebar → App Switcher
6. Update Vite config, Storybook globs, Docker/nginx
7. Verify everything works
8. Delete `apps/pops-pwa/`

At every step, the app should be runnable. No big-bang switchover.

## Dependencies

- Epic 1 (UI Library Extraction) — shared components must be in `@pops/ui` before we can split the shell from finance

## Risks

- **E2E test breakage** — Playwright tests target current routes. Routes will change from `/transactions` to `/finance/transactions`. Tests need updating.
- **Vite config complexity** — Resolving workspace packages in dev mode may require alias configuration.
- **Storybook** — Discovery globs need updating again to include the new app-finance package location.
