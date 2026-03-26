# US-06: Enforce action icon standards

> PRD: [003 — Components](README.md)
> Status: To Review

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
