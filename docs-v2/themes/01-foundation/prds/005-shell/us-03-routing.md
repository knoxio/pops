# US-03: Build router with lazy-loaded app registration

> PRD: [005 — Shell](README.md)
> Status: Done

**GH Issue:** #404

## Audit Findings

`apps/pops-shell/src/app/router.tsx` implements the full routing setup:

- `createBrowserRouter` from React Router v7
- Root route uses `<RootLayout />` as the wrapper, with a custom `errorElement` for crash recovery
- `/` redirects to `/finance` via `<Navigate to="/finance" replace />`
- Registered apps: `/finance/*`, `/media/*`, `/inventory/*`, `/ai/*`
- Each app exports a `routes` array; page components inside each app use `React.lazy()` for code splitting
- `withSuspense` helper wraps each route element in `<Suspense>` with a loading fallback
- `NotFoundPage` rendered inside the root route (within shell layout) for unmatched paths

**Note:** The shell statically imports each app's route registry (`import { routes } from "@pops/app-finance"`), but all page elements within those routes are `React.lazy()` — code splitting happens at the page level.

## Description

As a developer, I want a router that lazily loads app packages under namespaced routes so that each app is code-split and adding a new app is a one-line registration.

## Acceptance Criteria

- [ ] `router.tsx` uses `createBrowserRouter` from React Router
- [ ] Root route wraps children in `RootLayout`
- [ ] Each registered app is lazily loaded via `React.lazy()` and wrapped in `Suspense`
- [ ] Routes are namespaced: `/finance/*`, `/media/*`, `/inventory/*`, `/ai/*`
- [ ] `/` redirects to the default app
- [ ] Catch-all `*` route renders `NotFoundPage` within the shell layout
- [ ] `errorElement` on root route catches lazy-load failures — shows error page, not React crash screen
- [ ] `NotFoundPage` shows: heading, invalid URL, link to home
- [ ] App routes are code-split — visible as separate chunks in browser network tab
- [ ] Navigating between apps loads the target app's chunk on demand

## Notes

Adding a new app is: create the package, export routes + navConfig, add one lazy import + route entry in `router.tsx`. No other shell changes needed.
