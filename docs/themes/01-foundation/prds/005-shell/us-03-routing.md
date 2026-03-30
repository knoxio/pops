# US-03: Build router with lazy-loaded app registration

> PRD: [005 — Shell](README.md)
> Status: Done

## Description

As a developer, I want a router that lazily loads app packages under namespaced routes so that each app is code-split and adding a new app is a one-line registration.

## Acceptance Criteria

- [x] `router.tsx` uses `createBrowserRouter` from React Router
- [x] Root route wraps children in `RootLayout`
- [x] Each registered app is lazily loaded via `React.lazy()` and wrapped in `Suspense`
- [x] Routes are namespaced: `/finance/*`, `/media/*`, `/inventory/*`, `/ai/*`
- [x] `/` redirects to the default app
- [x] Catch-all `*` route renders `NotFoundPage` within the shell layout
- [x] `errorElement` on root route catches lazy-load failures — shows error page, not React crash screen
- [x] `NotFoundPage` shows: heading, invalid URL, link to home
- [x] App routes are code-split — visible as separate chunks in browser network tab
- [x] Navigating between apps loads the target app's chunk on demand

## Notes

Adding a new app is: create the package, export routes + navConfig, add one lazy import + route entry in `router.tsx`. No other shell changes needed.
