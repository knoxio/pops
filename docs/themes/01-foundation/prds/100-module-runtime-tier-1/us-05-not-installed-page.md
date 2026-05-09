# US-05: NotInstalledPage

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As a user, I want a recognisable "module not installed" page (distinct from 404) so that I understand the route exists but the module isn't enabled in this deployment.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/pages/NotInstalledPage.tsx` exports a route component that:
  - Shows a clear message naming the path that isn't installed.
  - Tells the operator how to enable it (`POPS_APPS` env var, restart).
  - Provides a "Go home" link.
- [ ] Used as the fallback by `RequireModule`.
- [ ] Visually distinct from `NotFoundPage` (different icon, different copy).

## Notes

- Avoid leaking server-side details. The page is shown to whoever bookmarked the route, not just to the operator.
