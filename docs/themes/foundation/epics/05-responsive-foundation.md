# Epic: Responsive Foundation

**Theme:** Foundation
**Priority:** 5 (do last — needs the shell and UI library in place)
**Status:** Not started

## Goal

Audit and fix the shell and shared UI components for mobile viewports. Every screen should be usable on a phone. Not pixel-perfect mobile design — functional and not broken.

## Scope

### In scope

- Audit all `@pops/ui` components on mobile viewports (375px, 390px, 428px)
- Fix layout issues: overflow, truncation, touch targets, spacing
- App Switcher: mobile-friendly (bottom nav? hamburger? swipe?)
- DataTable: horizontal scroll or card view on narrow screens
- Forms: stack inputs vertically, appropriate input sizes
- Dialogs/modals: full-screen on mobile
- Test on actual iPhone (not just DevTools responsive mode)

### Out of scope

- Native mobile app
- Offline/PWA service worker improvements
- App-specific page redesigns (just ensure shared components work)

## Deliverables

1. Shell layout works on 375px+ viewports
2. App Switcher has a mobile-appropriate interaction pattern
3. All shared components in `@pops/ui` render correctly on mobile
4. No horizontal scroll on any page at 375px width
5. Touch targets meet minimum 44x44px

## Dependencies

- Epic 1 (UI Library) — components must be in `@pops/ui`
- Epic 2 (Shell) — app switcher must exist
