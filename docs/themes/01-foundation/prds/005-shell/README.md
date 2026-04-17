# PRD-005: Shell

> Epic: [02 — Shell & App Switcher](../../epics/02-shell-app-switcher.md)
> Status: Partial

## Overview

Build `pops-shell` — the application shell that hosts all app packages. Owns layout, routing, providers, theming, and scroll behaviour. Apps plug in as workspace packages that export routes and nav config. The shell lazily loads them, wraps them in the shared layout, and handles everything the apps don't need to think about.

## Shell Structure

```
apps/pops-shell/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/
    main.tsx                (entry point, mounts App)
    app/
      App.tsx               (providers: tRPC, React Query, theme, toaster, router)
      router.tsx            (lazy-loads app routes, wraps in RootLayout)
      layout/
        RootLayout.tsx      (TopBar + sidebar + content area + error boundary)
        TopBar.tsx           (branding, theme toggle)
      pages/
        NotFoundPage.tsx    (styled 404 within shell layout)
    lib/
      trpc.ts               (tRPC client config)
    store/
      uiStore.ts            (sidebar state)
      themeStore.ts          (theme state)
```

## App Registration Pattern

Each app package exports routes and a nav config. The shell imports and mounts them:

```typescript
// App package exports (e.g., @pops/app-finance/src/index.ts)
export { routes } from './routes';
export { navConfig } from './routes';

// navConfig shape
export const navConfig: AppNavConfig = {
  id: 'finance',
  label: 'Finance',
  icon: 'DollarSign', // Lucide icon name
  color: 'emerald', // App accent colour
  basePath: '/finance',
  items: [
    { path: '', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/transactions', label: 'Transactions', icon: 'CreditCard' },
    // ...
  ],
};
```

The shell lazily loads each app:

```typescript
// apps/pops-shell/src/app/router.tsx
const financeRoutes = lazy(() => import('@pops/app-finance'));
const mediaRoutes = lazy(() => import('@pops/app-media'));
```

Adding a new app means: create a workspace package, export routes + navConfig, register in the shell router. No shell code changes beyond the registration.

## Routing

Flat, namespaced routes. The shell owns the router:

```
/                           → Redirect to default app
/finance/*                  → Finance app routes
/media/*                    → Media app routes
/inventory/*                → Inventory app routes
/ai/*                       → AI app routes
```

### Error Handling

- Catch-all `*` route renders `NotFoundPage` within the shell layout (nav stays visible)
- `errorElement` on root route catches React Router errors (lazy-load failures) — renders shell layout + error page, not React crash screen
- `NotFoundPage` shows: "Page not found" heading, the invalid URL, link back to home. Minimal.

### Code Splitting

Routes are lazy-loaded via `React.lazy()`. Each app package is a separate chunk — only the active app's code loads. Subsequent apps load on navigation.

## Layout & Scroll Behaviour

### Fixed Shell Chrome

TopBar and sidebar remain **fixed on screen** while page content scrolls. The user always has access to navigation regardless of scroll position.

- **TopBar:** Fixed to viewport top. `fixed top-0 w-full z-40`
- **Sidebar:** Fixed height, does not scroll with content. `fixed` or `sticky top-{topbar-height}` with `h-[calc(100vh-{topbar-height})]` and `overflow-y-auto` for long nav lists
- **Content area:** Scrolls independently. The `<main>` element handles its own scroll

**Critical:** `position: sticky` breaks when any ancestor has `overflow: hidden/auto/scroll`. The shell layout must not apply overflow containment to ancestors of the TopBar or sidebar.

### Page-Level Navigation (Back Button + Breadcrumbs)

Pages fall into two categories:

| Category       | Accessed via           | Back button | Breadcrumb |
| -------------- | ---------------------- | ----------- | ---------- |
| **Top-level**  | Sidebar/PageNav link   | No          | No         |
| **Drill-down** | Link from another page | Yes         | Yes        |

**Back button (drill-down pages only):**

- Position: top-left of page header, before breadcrumb and title
- Icon: `ArrowLeft` from Lucide
- Behaviour: navigates to the **logical parent** (not `history.back()`), so destination is predictable
- Style: ghost button, consistent across all apps

**Breadcrumbs (drill-down pages only):**

- Each segment is a clickable link except the current page (plain text)
- Separator: `›` or `/`, consistent across the app
- Clickable segments: `text-muted-foreground hover:text-foreground`
- Current page: `text-foreground font-medium`, not clickable
- Mobile truncation: collapse middle segments with `…`, always show first and last

**Examples:**

| Page             | Breadcrumb                          |
| ---------------- | ----------------------------------- |
| Movie detail     | Library › _Movie Title_             |
| Season detail    | Library › _Show Title_ › _Season N_ |
| Item detail      | Items › _Item Name_                 |
| Item form (edit) | Items › _Item Name_ › _Edit_        |

**Never place back navigation at the bottom of the page.**

Top-level pages show neither back button nor breadcrumbs — sidebar is the navigation.

## Provider Stack

```typescript
<trpc.Provider client={trpcClient} queryClient={queryClient}>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <ReactQueryDevtools />
    <Toaster />
  </QueryClientProvider>
</trpc.Provider>
```

### tRPC Access for App Packages

The shell provides tRPC context via React providers. App packages access tRPC hooks through the provider. Options for the import path:

- Shell re-exports `trpc` from a known path, apps use peer dependency
- Separate `@pops/trpc` or `@pops/api-client` package holds the client config

The key rule: app packages depend on `@pops/ui` and shared packages, never on other app packages. Cross-app communication goes through the API or shared stores.

## Vite Configuration

- Plugins: `react()`, `tailwindcss()`
- Proxy: `/trpc` → `localhost:3000`
- Dev server port: 5566
- Resolve alias: `@` → `apps/pops-shell/src`
- Workspace packages resolved natively by Vite

## Business Rules

- Apps must not know about the shell's layout internals — they provide pages, the shell wraps them
- All routes are namespaced under the app's `basePath`
- NavConfig is the single source of truth for sidebar items — no hardcoded nav lists in the shell
- Shell chrome (TopBar, sidebar) never scrolls with content
- Every drill-down page has back button + breadcrumbs. Every top-level page has neither

## Edge Cases

| Case                              | Behaviour                                                              |
| --------------------------------- | ---------------------------------------------------------------------- |
| Non-existent route                | NotFoundPage within shell layout — nav visible, user can navigate away |
| Lazy-load failure (network error) | errorElement catches it, shows error page within shell layout          |
| App has no colour declared        | Falls back to `--primary`                                              |
| Very long nav list (10+ items)    | Sidebar gets `overflow-y-auto` — scrolls independently                 |
| Deep breadcrumb on mobile         | Middle segments collapse to `…`, first and last always visible         |

## User Stories

| #   | Story                                           | Summary                                                                                                | Status  | Parallelisable   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- | ---------------- |
| 01  | [us-01-shell-scaffold](us-01-shell-scaffold.md) | Create pops-shell with entry point, Vite config, provider stack                                        | Done    | No (first)       |
| 02  | [us-02-layout](us-02-layout.md)                 | Build RootLayout, TopBar with fixed positioning, content area with independent scroll                  | Done    | Blocked by us-01 |
| 03  | [us-03-routing](us-03-routing.md)               | Build router with lazy-loaded app registration, namespaced routes, error handling, NotFoundPage        | Done    | Blocked by us-01 |
| 04  | [us-04-breadcrumbs](us-04-breadcrumbs.md)       | Build page-level navigation pattern: back button + breadcrumbs for drill-down pages, mobile truncation | Partial | Blocked by us-02 |
| 05  | [us-05-trpc-access](us-05-trpc-access.md)       | Set up tRPC client in shell and establish the import pattern for app packages                          | Done    | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01. US-04 depends on layout. US-05 can parallelise with US-02/US-03.

## Verification

Every US is only done when:

- `pnpm dev` starts the shell and serves app pages
- `pnpm build` produces one output with code splitting visible
- `pnpm typecheck`, `pnpm lint`, `pnpm test` pass
- TopBar and sidebar remain fixed at all scroll positions
- 404 page renders within shell layout
- Lazy-load failure shows error page, not React crash screen
- All E2E tests pass with namespaced routes

## Out of Scope

- App switcher navigation (PRD-006)
- App theme colour propagation (PRD-007)
- Responsive design audit (PRD-010)
- Individual app pages (each app theme owns its pages)

## Drift Check

last checked: never
