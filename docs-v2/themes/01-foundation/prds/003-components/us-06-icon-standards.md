# US-06: Enforce action icon standards

> PRD: [003 — Components](README.md)
> Status: Partial

**GH Issue:** #399

## Audit Findings

**Present:**
- All apps use Lucide React as the single icon library (no mixing with other icon sets)
- `apps/pops-shell/src/app/nav/icon-map.ts` defines a shared icon registry for navigation icons (Lucide only)
- No banned icon names (`Edit2`, `Trash`, `PenLine`) found in app packages or `@pops/ui`
- Destructive actions consistently use `Trash2`

**Missing:**
- No formal icon standard is documented or enforced in `@pops/ui` (icon choices live in individual app components)
- Icon-only buttons in table rows/list items are inconsistently labelled — not all have `aria-label`
- Text-only action labels still exist in some areas (no icon)
- Full sweep across all packages to verify consistent use of `Plus`, `Pencil`, `X` patterns has not been completed

## Description

As a developer, I want all interactive actions across the platform to use the standardised Lucide icon vocabulary so that the UI is consistent and predictable.

## Acceptance Criteria

- [ ] All "add/create" actions use `Plus` icon
- [ ] All "edit" actions use `Pencil` icon (not `Edit2`, not `PenLine`)
- [ ] All "delete/remove" actions use `Trash2` icon (not `Trash`)
- [ ] All "close/dismiss" actions use `X` icon
- [ ] No text-only action labels exist — every action has an icon (icon-only with `aria-label`, or icon + text)
- [ ] All icon-only buttons have `aria-label` for accessibility
- [ ] All destructive actions use `variant="ghost"` with `text-destructive` styling
- [ ] Compact actions (table rows, list items) use icon-only buttons
- [ ] Prominent actions (page CTAs, form buttons) use icon + text
- [ ] `grep` for banned icon names (`Edit2`, `Trash`, `PenLine`) returns zero hits

## Notes

This is an audit and sweep across all packages, not just `@pops/ui`. App packages need to follow the same standards. Do one app at a time and verify visually.
