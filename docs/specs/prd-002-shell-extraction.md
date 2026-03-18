# PRD-002: Shell & App-Finance Extraction

**Epic:** [02 — Shell Extraction](../themes/foundation/epics/02-shell-extraction.md)
**Theme:** Foundation
**Status:** Approved
**ADRs:** [002 — Shell Architecture](../architecture/adr-002-shell-architecture.md)

## Problem Statement

All frontend code lives in `apps/pops-pwa/` — layout, providers, routing, pages, and domain components are interleaved in one package. To support multiple apps (media, inventory, fitness, etc.) on a shared shell, we need to split the platform infrastructure from the finance domain code.

## Goal

Create `apps/pops-shell/` as the single frontend entry point (layout, providers, routing, theming) and `packages/app-finance/` as the first app package (finance pages + domain components). After extraction, adding a new app means creating a new `packages/app-*` package and registering its routes in the shell.

## Requirements

### R1: Shell Package (`apps/pops-shell/`)

The shell owns everything that's shared across apps:

```
apps/pops-shell/
  package.json            (@pops/shell)
  tsconfig.json
  vite.config.ts          (migrated from pops-pwa, updated aliases)
  index.html              (migrated from pops-pwa)
  src/
    main.tsx              (entry point, mounts App)
    app/
      App.tsx             (providers: tRPC, React Query, theme, toaster, router)
      router.tsx          (lazy-loads app routes, wraps in RootLayout)
      layout/
        RootLayout.tsx    (top bar + sidebar + outlet + error boundary)
        TopBar.tsx        (POPS branding, theme toggle, user info)
        Sidebar.tsx       (app-level navigation — just Finance for now)
    lib/
      trpc.ts             (tRPC client config — unchanged)
    store/
      uiStore.ts          (sidebar state)
      themeStore.ts       (theme state)
      themeStore.test.ts
```

**Key changes from current pops-pwa:**
- `router.tsx` lazily imports route definitions from `@pops/app-finance` instead of statically importing page components
- Sidebar renders navigation items from the active app's route config (not a hardcoded list)
- Theme CSS imported from `@pops/ui/theme`
- All shared component imports come from `@pops/ui`

### R2: App-Finance Package (`packages/app-finance/`)

Finance becomes a workspace package that exports its route definitions:

```
packages/app-finance/
  package.json            (@pops/app-finance)
  tsconfig.json
  src/
    index.ts              (exports routes and nav config)
    routes.tsx            (route definitions with lazy-loaded pages)
    pages/
      DashboardPage.tsx
      TransactionsPage.tsx
      EntitiesPage.tsx
      BudgetsPage.tsx
      InventoryPage.tsx   (stays here for now — moves to app-inventory in Phase 2)
      WishlistPage.tsx
      ImportPage.tsx
      AiUsagePage.tsx
    components/
      imports/            (entire ImportWizard and sub-components)
      TagEditor.tsx
      TagEditor.stories.tsx
    store/
      importStore.ts
    lib/
      transaction-utils.ts
```

**Public API:**

```typescript
// packages/app-finance/src/index.ts
export { routes } from './routes'
export { navConfig } from './routes'
```

**Route definitions:**

```typescript
// packages/app-finance/src/routes.tsx
import { lazy } from 'react'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'))
// ... etc

export const navConfig = {
  id: 'finance',
  label: 'Finance',
  icon: '💰',  // placeholder — proper icons in PRD-003
  basePath: '/finance',
  items: [
    { path: '', label: 'Dashboard', icon: '📊' },
    { path: '/transactions', label: 'Transactions', icon: '💳' },
    { path: '/entities', label: 'Entities', icon: '🏢' },
    { path: '/budgets', label: 'Budgets', icon: '💰' },
    { path: '/inventory', label: 'Inventory', icon: '📦' },
    { path: '/wishlist', label: 'Wish List', icon: '⭐' },
    { path: '/import', label: 'Import', icon: '📥' },
    { path: '/ai-usage', label: 'AI Usage', icon: '🤖' },
  ],
}

export const routes = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'entities', element: <EntitiesPage /> },
  { path: 'budgets', element: <BudgetsPage /> },
  { path: 'inventory', element: <InventoryPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'ai-usage', element: <AiUsagePage /> },
]
```

### R3: Routing Changes

**Current routes:**
```
/                → DashboardPage
/transactions    → TransactionsPage
/budgets         → BudgetsPage
...
```

**New routes:**
```
/                → Redirect to /finance
/finance         → DashboardPage (index)
/finance/transactions → TransactionsPage
/finance/budgets      → BudgetsPage
...
```

**Shell router structure:**

```typescript
// apps/pops-shell/src/app/router.tsx
import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from './layout/RootLayout'
import { routes as financeRoutes } from '@pops/app-finance'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/finance" replace /> },
      {
        path: 'finance',
        children: financeRoutes,
      },
      // Future: { path: 'media', children: mediaRoutes }
    ],
  },
])
```

### R4: Sidebar Navigation

The Sidebar reads navigation config from registered apps instead of a hardcoded list. For now it only shows Finance, but the data structure supports multiple apps.

```typescript
// Shell knows about registered apps
const registeredApps = [
  { ...financeNavConfig },
  // Future: { ...mediaNavConfig }
]
```

The Sidebar renders:
- App name/icon for each registered app (clickable, navigates to app's basePath)
- Page links for the currently active app

This is a minimal version — the full app switcher UX is PRD-003.

### R5: Provider Stack

The provider stack moves from `pops-pwa/App.tsx` to `pops-shell/App.tsx`. No changes to the providers themselves:

```typescript
<trpc.Provider client={trpcClient} queryClient={queryClient}>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <ReactQueryDevtools />
    <Toaster />
  </QueryClientProvider>
</trpc.Provider>
```

The tRPC client config (`lib/trpc.ts`) moves to the shell unchanged. The `AppRouter` type import stays as `@pops/finance-api` until Epic 3 (API modularisation) renames it.

### R6: Vite Config

The shell's Vite config is based on the current `pops-pwa/vite.config.ts`:

- Same plugins: `react()`, `tailwindcss()`
- Proxy `/trpc` → `localhost:3000` (unchanged)
- Dev server port: 5566 (unchanged)
- Resolve alias: `@` → `apps/pops-shell/src`
- Workspace packages resolved natively by Vite (no special config needed for `@pops/ui`, `@pops/app-finance`)
- Storybook Vitest plugin config needs updating — story discovery from `packages/` directories

### R7: E2E Test Migration

4 Playwright spec files need route updates:

| File | Change |
|------|--------|
| `transactions.spec.ts` | `/transactions` → `/finance/transactions` |
| `transactions-integration.spec.ts` | `/transactions` → `/finance/transactions` |
| `import-wizard.spec.ts` | `/import` → `/finance/import` |
| `import-wizard-integration.spec.ts` | `/import` → `/finance/import` |

E2E tests move to `apps/pops-shell/e2e/` since they test the integrated app, not individual packages. Fixtures and helpers move with them.

### R8: Cleanup

- Delete `apps/pops-pwa/` entirely after all code is extracted
- Update `pnpm-workspace.yaml` to include `packages/app-finance`
- Update Turbo config if needed
- Update mise tasks referencing `pops-pwa`
- Update Docker/nginx configs to build from `apps/pops-shell/`
- Update CLAUDE.md

## Out of Scope

- Full app switcher redesign (PRD-003)
- API rename (Epic 3)
- New apps (Phase 2)
- New components
- Responsive design (Epic 5)

## Acceptance Criteria

1. `apps/pops-shell/` is the single frontend entry point
2. `packages/app-finance/` contains all finance pages and domain components
3. `apps/pops-pwa/` is deleted
4. Routes are namespaced under `/finance/*`
5. `/` redirects to `/finance`
6. Sidebar shows Finance nav items driven by the app's exported navConfig
7. Lazy loading works — finance routes are code-split (verify in network tab)
8. `pnpm dev` starts one Vite server
9. `pnpm build` produces one output with code splitting
10. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` all pass
11. All E2E tests pass with updated routes
12. Storybook discovers stories from both `@pops/ui` and `@pops/app-finance`
13. Docker/nginx/deployment configs updated and working

## Edge Cases & Decisions

**Q: Where does InventoryPage live?**
A: In `@pops/app-finance` for now. It moves to `@pops/app-inventory` when that app is built in Phase 2. Don't prematurely extract it.

**Q: Where do E2E tests live?**
A: In `apps/pops-shell/e2e/`. E2E tests exercise the integrated system, not individual packages. Unit tests for finance components stay in `packages/app-finance/`.

**Q: What about the tRPC AppRouter type import?**
A: Stays as `import type { AppRouter } from '@pops/finance-api'` until Epic 3 renames the API. The shell owns the tRPC client; app packages use tRPC hooks via the shell's provider.

**Q: How do app packages access tRPC?**
A: The shell provides the tRPC context via React providers. App packages import the `trpc` object from the shell (or from a shared package). The simplest approach: the shell re-exports `trpc` from a known import path, and app packages list `@pops/shell` as a peer dependency. Alternative: extract `trpc` into a tiny shared package. Decide during implementation based on what's cleaner.

**Q: Do app packages depend on the shell?**
A: No circular deps. App packages depend on `@pops/ui` and `@pops/db-types`. The shell depends on app packages. For tRPC access, either: (a) the shell passes `trpc` down via context/props, (b) a separate `@pops/trpc` package holds the client config, or (c) app packages list `@pops/shell` as a peer dep. Option (b) is cleanest if it becomes an issue.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Create shell package scaffold
**As a** developer, **I want** `apps/pops-shell/` to exist with entry point, Vite config, and basic providers **so that** I have a running shell to wire apps into.

**Acceptance criteria:**
- `apps/pops-shell/package.json` exists
- `apps/pops-shell/vite.config.ts` configured (proxy, aliases, plugins)
- `apps/pops-shell/index.html` exists
- `apps/pops-shell/src/main.tsx` mounts the App
- `apps/pops-shell/src/app/App.tsx` has provider stack (tRPC, React Query, theme, toaster)
- `pnpm dev` starts the shell on port 5566

### US-2: Create app-finance package
**As a** developer, **I want** `packages/app-finance/` to exist with all finance pages, domain components, and route exports **so that** the shell can lazily load finance.

**Acceptance criteria:**
- `packages/app-finance/package.json` exists
- All 8 finance pages moved to `packages/app-finance/src/pages/`
- All finance-specific components moved (imports/, TagEditor)
- `importStore` and `transaction-utils` moved
- Route definitions and navConfig exported from `packages/app-finance/src/index.ts`
- All finance page internal imports resolve correctly

### US-3: Wire shell routing with lazy-loaded finance
**As a** developer, **I want** the shell to lazily load finance routes under `/finance/*` **so that** the app works with the new structure.

**Acceptance criteria:**
- Shell router imports routes from `@pops/app-finance`
- `/` redirects to `/finance`
- All finance pages accessible at `/finance/*` routes
- Finance routes are code-split (visible in browser network tab as separate chunks)
- Sidebar renders nav items from finance's exported navConfig

### US-4: Migrate shell layout and stores
**As a** developer, **I want** RootLayout, TopBar, Sidebar, and shared stores in the shell **so that** the platform chrome is owned by the shell, not any app.

**Acceptance criteria:**
- `RootLayout.tsx`, `TopBar.tsx`, `Sidebar.tsx` in `apps/pops-shell/src/app/layout/`
- `uiStore.ts`, `themeStore.ts` in `apps/pops-shell/src/store/`
- `trpc.ts` in `apps/pops-shell/src/lib/`
- Sidebar reads navigation from registered app configs, not a hardcoded list

### US-5: Migrate E2E tests
**As a** developer, **I want** all E2E tests passing in the new structure **so that** we don't lose test coverage.

**Acceptance criteria:**
- E2E tests in `apps/pops-shell/e2e/`
- All routes updated (`/transactions` → `/finance/transactions`, etc.)
- All 4 spec files pass
- Fixtures and helpers migrated

### US-6: Update config and clean up
**As a** developer, **I want** all tooling, docs, and deployment config updated **so that** the migration is complete.

**Acceptance criteria:**
- `apps/pops-pwa/` deleted
- `pnpm-workspace.yaml` updated
- Storybook discovers stories from `@pops/ui` and `@pops/app-finance`
- mise tasks updated (references to pops-pwa → pops-shell)
- Docker/nginx configs updated
- CLAUDE.md updated
- Turbo config updated if needed
