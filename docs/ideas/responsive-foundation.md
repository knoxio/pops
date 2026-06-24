# Responsive Foundation — follow-ups

Open work beyond the shipped [Responsive Foundation PRD](../themes/foundation/prds/responsive-foundation/README.md). The breakpoint system, shell mobile layout, component adaptation patterns, primitive touch targets, and empty/error/page-header conventions are built. The items below are not.

## Consumer-side touch-target audit

Primitive enforcement (Button, Checkbox, RadioGroupItem, Switch, TabsTrigger, Dialog close, PageHeader back button) shipped so it could land without blocking on hundreds of call-site changes. Outside the primitive system, raw `<button>` / `<a>` elements and bare icon glyphs used as click targets are **not** guaranteed to meet the 44×44px minimum.

Needed:

- Sweep pillar app code (`pillars/*/app`) and the shell for raw interactive elements that bypass the Button primitive.
- Route them through the primitive system, or give them a `min-w-11 min-h-11` / `before:`-pseudo expansion.
- Prefer a lint rule over a one-time manual pass so the audit does not rot.

Acceptance criteria:

- [ ] No raw interactive element in shell or pillar apps falls below 44×44px tappable area
- [ ] Icon-only click targets either use Button `size="icon*"` or carry an explicit ≥44px hit area
- [ ] A lint rule flags new raw interactive elements that lack a 44px hit area

## `Chip` remove button at 44px

`Chip`'s remove control is a raw `<button>` with `p-0.5` — well under the 44px minimum. `ChipInput` wraps and the container is `min-h-11`, but the per-chip remove affordance is not touch-sized.

Acceptance criteria:

- [ ] `Chip` remove button has a ≥44px tappable area (via the Button primitive or a `before:` expansion) without enlarging the visual chip
- [ ] Verified at 375px: remove buttons are individually tappable when chips wrap across lines

## Broader primitive touch-target test coverage

`primitives/touch-targets.test.ts` asserts only Button variants. `Checkbox`, `RadioGroupItem`, `Switch`, and `TabsTrigger` carry the expansion classes but have no test pinning them.

Acceptance criteria:

- [ ] Tests assert the `before:-inset-*` / `min-w-11` touch-target classes on Checkbox, RadioGroupItem, Switch, and TabsTrigger
- [ ] Regressions that drop a touch-target utility fail CI

## Title-icon consistency enforcement

The "all-or-none title icons per app" rule is documented convention only. Nothing enforces it.

Acceptance criteria:

- [ ] A check (lint or test) verifies that within one app, top-level pages either all pass an `icon` to `PageHeader` or none do
- [ ] When present, the title icon matches that page's nav icon
