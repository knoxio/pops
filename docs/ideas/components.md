# Idea: Finish + automate the action-icon standards sweep

Spun out of [Components](../themes/foundation/prds/components.md).
The shared library (`@pops/ui`) is built and shipped; what remains is the
cross-codebase **icon-standards sweep** and turning the convention into
machine-enforced rules.

## Problem

The Lucide icon vocabulary (`components` → Action Icon Standards) is documented and
mostly followed, but it is a convention with no guard rail:

- A banned icon still slips through. `PenLine` is imported in
  `pillars/inventory/app/src/pages/item-form-page/sections/NotesSection.tsx` —
  the "grep for banned icon names returns zero hits" criterion is false.
- The compact-vs-prominent button pattern (icon-only with `aria-label` in table
  rows / list items; icon + text for page CTAs and form buttons) has never been
  audited end-to-end across the seven `@pops/app-*` frontends.
- `oxlint` (`.oxlintrc.json`) carries no `no-restricted-imports` rule for the
  banned icon names (`Edit2`, `PenLine`, `Trash`, `Ellipsis`, `Cog`, `Gear`,
  `RefreshCcw`), so nothing stops a regression.

## Proposed work

1. **Banned-icon lint.** Add an `oxlint` `no-restricted-imports` (or a small CI
   script under `scripts/ci/`) that fails on any import of a banned Lucide name
   from `lucide-react`, with the canonical replacement in the message. Wire it
   into the CI Gate. This makes the "zero hits" guarantee real and permanent.
2. **Fix the known offender.** Replace `PenLine` with `Pencil` in the inventory
   notes section, then let the new lint keep it clean.
3. **Compact/prominent audit.** One pillar app at a time: confirm table-row and
   list-item actions are icon-only with `aria-label`, and page/form CTAs are
   icon + text. Verify visually in Storybook (light + dark). Record per-app
   completion.
4. **(Optional) aria-label lint.** A rule that flags `size="icon"` Buttons with
   no `aria-label` would catch the most common accessibility miss mechanically.

## Acceptance criteria

- [ ] CI fails on any import of a banned Lucide icon name from `lucide-react`
- [ ] `PenLine` (and any other banned name) removed from the codebase
- [ ] Each `@pops/app-*` frontend audited: compact actions icon-only + `aria-label`, prominent actions icon + text
- [ ] Audit results recorded per app; no text-only action labels remain
- [ ] (stretch) lint flags `size="icon"` buttons missing `aria-label`

## Done when

The icon vocabulary is enforced by tooling, the known `PenLine` offender is
gone, and every app frontend has passed the compact/prominent pattern audit —
at which point these criteria fold back into the [Components](../themes/foundation/prds/components.md) PRD as `[x]`.
