# US-01: Context provider

> PRD: [058 — Contextual Intelligence](README.md)
> Status: Done

## Description

As a developer, I want a context provider that tracks the active app and exposes it to consumers so that search and AI overlay know where the user is.

## Acceptance Criteria

- [x] Context provider wraps the app (in shell's provider stack)
- [x] Active app detected from URL path (`/media/*` → "media", `/finance/*` → "finance")
- [x] Updates automatically on navigation
- [x] `useAppContext()` hook returns current context
- [x] Default context when no app matched (e.g. root `/`): `{ app: null, page: null, pageType: "top-level" }` — entity and filters are undefined
- [x] No re-renders in components that don't consume context

## Notes

URL-based app detection is the baseline. Page-level context (US-02) adds richer information on top.

The provider and hooks live in `packages/navigation/` (already exists as shared nav config). This avoids circular deps — shell, app packages, and `@pops/ui` can all import from `@pops/navigation` without depending on the shell.
