# US-03: Touch target audit

> PRD: [010 — Responsive Foundation](README.md)
> Status: Done (primitives) / Follow-up (consumer audit)

## Description

As a user on a touch device, I want all interactive elements to be easy to tap so that I don't accidentally hit the wrong thing.

## Acceptance Criteria

- [x] All buttons meet 44x44px minimum touch target — `primitives/button.tsx` enforces `h-11`/`size-11` on `default`/`lg`/`icon`/`icon-lg` and an invisible `before:` pseudo-element on `xs`/`sm`/`icon-xs`/`icon-sm`. The legacy `components/Button.tsx` `sm` variant gains a matching `before:-inset-y-1` expansion and the `link` variant gains `min-h-11`.
- [x] All links meet 44x44px minimum — `Button variant="link"` has `min-h-11`; raw `<a>` usages outside the primitive system are tracked in the consumer-audit follow-up.
- [x] All checkboxes, radio buttons, switches meet 44x44px minimum — `primitives/checkbox.tsx`, `primitives/radio-group.tsx`, and `primitives/switch.tsx` each use `before:absolute before:-inset-3.5 before:content-['']` to expand the tappable area beyond the visual control.
- [x] Chip remove buttons meet 44x44px minimum — Chips use Button `size="icon-sm"` which carries the `before:-inset-1` expansion to 44px.
- [x] Minimum 8px spacing between adjacent interactive elements — invisible `before:` pseudo-elements are inset-relative to each control's visual size, so adjacent controls remain visually separated as long as standard `gap-*` utilities are used.
- [x] Table row actions (edit, delete icons) meet 44x44px minimum — wrapped in Button `size="icon-sm"` which has the pseudo-element expansion.
- [x] Verified across all `@pops/ui` primitive variants via `primitives/touch-targets.test.ts`. `TabsTrigger` was given `min-w-11` so a horizontally-scrolled tab strip with very short labels still meets the minimum width.

## Notes

Per Apple HIG and WCAG. The visual element can be smaller than 44px — the tappable area (padding + element) must be at least 44x44px.

Canonical implementation pattern (see `primitives/button.tsx`):

```tsx
"relative h-9 before:absolute before:-inset-1.5 before:content-['']";
// 36px visual + 6px each side via `before` = 48px tappable; >= 44px
```

### Follow-up

Consumer-side audit (raw `<button>`/`<a>` elements outside the primitive system, icon glyphs used as click targets without going through the Button primitive) is tracked in knoxio/pops#2564 so that the primitive enforcement here can ship without being blocked by hundreds of call-site changes.
