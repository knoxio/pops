# US-06: Enforce action icon standards

> PRD: [003 — Components](README.md)
> Status: Partial — aria-label and doc done, full icon sweep pending

## Description

As a developer, I want all interactive actions across the platform to use the standardised Lucide icon vocabulary so that the UI is consistent and predictable.

## Acceptance Criteria

- [x] All "add/create" actions use `Plus` icon
- [x] All "edit" actions use `Pencil` icon (not `Edit2`, not `PenLine`)
- [x] All "delete/remove" actions use `Trash2` icon (not `Trash`)
- [x] All "close/dismiss" actions use `X` icon
- [x] No text-only action labels exist — every action has an icon (icon-only with `aria-label`, or icon + text)
- [x] All icon-only buttons have `aria-label` for accessibility
- [x] All destructive actions use `variant="ghost"` with `text-destructive` styling
- [ ] Compact actions (table rows, list items) use icon-only buttons
- [ ] Prominent actions (page CTAs, form buttons) use icon + text
- [x] `grep` for banned icon names (`Edit2`, `Trash`, `PenLine`) returns zero hits

## Notes

This is an audit and sweep across all packages, not just `@pops/ui`. App packages need to follow the same standards. Do one app at a time and verify visually.

Icon standards are documented in [icon-standards.md](icon-standards.md).
