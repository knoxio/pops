# US-02: Build shell layout

> PRD: [005 — Shell](README.md)
> Status: Done

**GH Issue:** #403

## Audit Findings

Full layout implemented in `apps/pops-shell/src/app/layout/`:

- `RootLayout.tsx` — wraps TopBar + AppRail + PageNav (desktop) + Sidebar (mobile) + `<main>` with `<ErrorBoundary>`; `<Outlet />` renders inside ErrorBoundary
- `TopBar.tsx` — POPS branding with gradient text, theme toggle (Sun/Moon icons), hamburger for mobile; `fixed top-0 w-full z-40`
- `AppRail.tsx` — icon-only app switcher for desktop (hidden on mobile)
- `PageNav.tsx` — page-level nav links for the active app (desktop)
- `Sidebar.tsx` — mobile overlay with hamburger toggle; controlled via `uiStore`

Content area uses `<main>` with padding, rendered below the fixed TopBar via `pt-14 md:pt-16`. No ancestor has `overflow: hidden` that would trap the fixed TopBar.

## Description

As a developer, I want a RootLayout with fixed TopBar and scrolling content area so that navigation is always accessible regardless of scroll position.

## Acceptance Criteria

- [ ] `RootLayout.tsx` exists wrapping TopBar + content area + ErrorBoundary
- [ ] `TopBar.tsx` exists with POPS branding and theme toggle (light/dark)
- [ ] TopBar is fixed to viewport top (`fixed top-0 w-full z-40`)
- [ ] Content area scrolls independently below the fixed TopBar
- [ ] No ancestor of TopBar has `overflow: hidden/auto/scroll` (would break sticky/fixed positioning)
- [ ] Content area uses `<main>` element for its own scroll
- [ ] Layout works at all viewport widths (375px to 1536px+)
- [ ] `pnpm dev` renders the layout with TopBar visible at all scroll positions

## Notes

Sidebar positioning is also fixed but its content comes from the app switcher (PRD-006). For now, the layout should reserve space for a sidebar but it can be empty.
