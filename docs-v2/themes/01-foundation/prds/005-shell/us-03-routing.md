# US-03: Build router with lazy-loaded app registration

> PRD: [005 — Shell](README.md)
> Status: To Review

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
