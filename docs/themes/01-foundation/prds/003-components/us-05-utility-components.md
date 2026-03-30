# US-05: Build utility composites

> PRD: [003 — Components](README.md)
> Status: Done

## Description

As a developer, I want utility composite components (enhanced Button, Chip, enhanced DropdownMenu, enhanced Select, ErrorBoundary) in `@pops/ui` so that common patterns are standardised.

## Acceptance Criteria

- [x] Button wrapper — extends primitive Button with icon support, loading state
- [x] Chip — dismissable tag/label with optional colour
- [x] DropdownMenu wrapper — extends primitive with standardised menu item patterns
- [x] Select wrapper — extends primitive with consistent label/error patterns
- [x] ErrorBoundary — catches render errors, displays fallback UI, logs error
- [x] Each component has co-located `.stories.tsx` (where applicable)
- [x] All exported from barrel `index.ts`
- [x] All use design tokens
- [x] Button loading state disables interaction and shows spinner
- [x] ErrorBoundary fallback shows a "something went wrong" message with retry action

## Notes

These are wrappers that add consistent patterns on top of primitives. The primitive `button.tsx` provides the unstyled base; the composite `Button.tsx` adds icon positioning, loading state, and variant defaults. Barrel exports the composite as `Button`.
