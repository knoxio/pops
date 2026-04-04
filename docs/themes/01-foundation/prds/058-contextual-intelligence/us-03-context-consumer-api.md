# US-03: Context consumer API

> PRD: [058 — Contextual Intelligence](README.md)
> Status: Not started

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

Consumer hooks are exported from `@pops/navigation` (same package as the context provider, US-01). This means any package in the monorepo can import `useAppContext`, `useCurrentApp`, `useCurrentEntity` without depending on the shell.
