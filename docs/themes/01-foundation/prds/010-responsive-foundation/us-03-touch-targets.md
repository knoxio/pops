# US-03: Touch target audit

> PRD: [010 — Responsive Foundation](README.md)
> Status: Not started

## Description

As a user on a touch device, I want all interactive elements to be easy to tap so that I don't accidentally hit the wrong thing.

## Acceptance Criteria

- [ ] All buttons meet 44x44px minimum touch target
- [ ] All links meet 44x44px minimum
- [ ] All checkboxes, radio buttons, switches meet 44x44px minimum
- [ ] Chip remove buttons meet 44x44px minimum
- [ ] Minimum 8px spacing between adjacent interactive elements
- [ ] Table row actions (edit, delete icons) meet 44x44px minimum
- [ ] Verified across all `@pops/ui` components

## Notes

Per Apple HIG and WCAG. The visual element can be smaller than 44px — the tappable area (padding + element) must be at least 44x44px.
