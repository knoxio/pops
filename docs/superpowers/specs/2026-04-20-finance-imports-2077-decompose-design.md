---
title: 'refactor(finance-imports): decompose CorrectionProposalDialog + TagReviewStep (#2077)'
date: 2026-04-20
issue: 2077
scope: app-finance imports UI refactor (no behavior change)
status: draft
---

## Goal

Bring these files into agent-optimal lint targets (Oxlint defaults):

- `max-lines`: 200
- `max-lines-per-function`: 60
- `complexity`: 12

And then tighten/remove the `packages/app-finance/src/components/imports/**/*` Tier-2 override in `.oxlintrc.json`.

Target files:

- `packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`
- `packages/app-finance/src/components/imports/TagReviewStep.tsx`

## Non-goals

- No UX changes
- No API / data-contract changes
- No new features
- No broad “design system” churn in `@pops/ui` unless something is _clearly_ reusable beyond finance-imports

## Constraints / Principles

- **Stable entrypoints**: keep `CorrectionProposalDialog.tsx` and `TagReviewStep.tsx` as public import targets.
- **Locality first**: extracted modules live next to their feature unless they’re truly cross-feature reusable.
- **No “barrelising for no reason”**: no new `index.ts` barrels unless a directory has many siblings and imports are genuinely noisy.
- **Small files, named seams**: each extracted unit should have a single purpose and be discoverable by filename.

## Proposed structure

### Correction Proposal (proposal + browse)

Keep existing extracted panels and hooks:

- `packages/app-finance/src/components/imports/CorrectionProposalDialogPanels.tsx`
- `packages/app-finance/src/components/imports/hooks/*`
- `packages/app-finance/src/components/imports/correction-proposal-shared.ts`

Add a feature-local folder for dialog “modes”:

- `packages/app-finance/src/components/imports/correction-proposal/`
  - `CorrectionProposalWorkflow.tsx` (proposal mode body/footer/subpanel wiring)
  - `CorrectionRuleManagerDialog.tsx` (browse mode wiring + 3-col grid composition)
  - `types.ts` (if needed to share tiny types without circular imports)

New responsibility split:

- `CorrectionProposalDialog.tsx`
  - Owns props and top-level decisions (browse vs proposal).
  - Owns query bootstrapping that must stay at the entrypoint boundary.
  - Delegates all JSX composition to the mode components.

### Tag Review

Extract a feature-local folder:

- `packages/app-finance/src/components/imports/tag-review/`
  - `useTagReviewState.ts` (localTags + suggestedTagMeta + handlers)
  - `tagReviewUtils.ts` (pure helpers: group/union/tagMeta mapping)
  - `EntityGroup.tsx` (group UI + staged group tags row)
  - `TransactionTagRow.tsx` (single row UI)
  - `GroupBulkTagRow.tsx` (optional: only if it meaningfully reduces `EntityGroup` size)
  - `types.ts` (optional, only if types become noisy)

New responsibility split:

- `TagReviewStep.tsx`
  - Owns step framing (header, footer nav, dialog mount).
  - Delegates data/handlers to `useTagReviewState`.
  - Renders groups via `EntityGroup`.

## Reuse rules (when to move into shared packages)

Promote extracted components to shared locations only when:

- They’re already duplicated elsewhere, or
- They are obviously generic (no import-store coupling, no finance-only types), and
- They improve long-term consistency (not just “cleaner folders”).

Otherwise keep them in `imports/tag-review/*` or `imports/correction-proposal/*`.

## Oxlint plan

1. Refactor the two target files into thin entrypoints (<200 lines).
2. Ensure extracted files also meet strict defaults (the goal is no Tier-2 exceptions).
3. Tighten `.oxlintrc.json` override for `packages/app-finance/src/components/imports/**/*`:
   - Prefer removing it entirely.
   - If other files still exceed strict defaults, narrow the override to the remaining offenders.

## Safety checks

- Run `mise lint` and `mise typecheck`.
- Spot-check the two flows:
  - Correction proposal dialog (proposal mode)
  - Manage rules dialog (browse mode)
  - Tag Review step (group edits, continue, tag rule dialog apply)
