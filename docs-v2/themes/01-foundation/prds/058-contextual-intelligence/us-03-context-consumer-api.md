# US-03: Context consumer API

> PRD: [058 — Contextual Intelligence](README.md)
> Status: To Review

## Description

As a developer, I want a clean API for consumers (Search, AI) to read the current context so that they can use it for prioritisation and scoping.

## Acceptance Criteria

- [ ] `useAppContext()` returns full `AppContext` object
- [ ] `useCurrentApp()` convenience hook returns just the app string
- [ ] `useCurrentEntity()` convenience hook returns the entity if on a drill-down page, null otherwise
- [ ] Context is always up-to-date (reflects current navigation state)
- [ ] TypeScript types exported for consumer use
- [ ] Works from any component in the tree (shell, app packages, @pops/ui)

## Notes

Consumers should be able to import hooks from a shared location — either the shell re-exports them or they live in a shared package.
