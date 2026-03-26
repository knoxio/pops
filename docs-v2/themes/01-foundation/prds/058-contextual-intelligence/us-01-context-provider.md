# US-01: Context provider

> PRD: [058 — Contextual Intelligence](README.md)
> Status: Not started

## Description

As a developer, I want a context provider that tracks the active app and exposes it to consumers so that search and AI overlay know where the user is.

## Acceptance Criteria

- [ ] Context provider wraps the app (in shell's provider stack)
- [ ] Active app detected from URL path (`/media/*` → "media", `/finance/*` → "finance")
- [ ] Updates automatically on navigation
- [ ] `useAppContext()` hook returns current context
- [ ] Default context when no app matched (e.g., root `/`)
- [ ] No re-renders in components that don't consume context

## Notes

URL-based app detection is the baseline. Page-level context (US-02) adds richer information on top.
