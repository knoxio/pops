# US-04: Frontend route filtering

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As a user, I want shell routes for absent modules to render a clear "not installed" page so that bookmarks and deep-links degrade instead of 404'ing.

## Acceptance Criteria

- [ ] A `RequireModule` route guard in `apps/pops-shell/src/app/RequireModule.tsx` fetches `core.shell.manifest` once and renders `Outlet` when the module is installed, `NotInstalledPage` otherwise.
- [ ] The manifest query uses `staleTime: Infinity` (it only changes on server restart).
- [ ] Each optional top-level route (`/finance`, `/media`, `/inventory`, `/cerebrum`) is wrapped with `<RequireModule moduleId="..." />`.
- [ ] Default behaviour (env unset) is unchanged — `RequireModule` resolves to the route's children.

## Notes

- Vite already code-splits per workspace package, so the dynamic-import requirement of the original spike is implicit; no further bundling change is needed for Tier 1.
- Switching to async `createBrowserRouter` is out of scope; the synchronous router stays.
