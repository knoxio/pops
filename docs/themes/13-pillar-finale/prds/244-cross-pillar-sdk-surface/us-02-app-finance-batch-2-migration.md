# US-02: Migrate `app-finance` batch 2 (23 cross-pillar sites) onto `pillar('core').*`

> PRD: [PRD-244 — Cross-pillar SDK surface](README.md)

## Description

As an `app-finance` consumer, I want the 23 deferred cross-pillar call sites
(`trpc.core.{corrections,tagRules,entities}.*`) swapped to the existing
PRD-227 SDK surface (`usePillarQuery('core', …)` /
`usePillarMutation('core', …)`) so that `app-finance` ships without depending
on `@pops/api-client` and the remaining batch-2 work from PRD-227 is closed.

## Acceptance Criteria

- [ ] Every cross-pillar site listed in [app-finance-consumer-inventory.md](../../notes/app-finance-consumer-inventory.md) under the `trpc.core.*` (Medium, 23) section is migrated:
  - [ ] `pages/entities/useEntitiesPage.ts` — `core.entities.{create,update,delete,list}`.
  - [ ] `pages/rules-browser/useRulesBrowserModel.ts` — `core.corrections.{delete,list}`.
  - [ ] `pages/rules-browser/rule-form/useRuleFormState.ts` — `core.corrections.{createOrUpdate,update}`, `core.entities.list`.
  - [ ] `pages/rules-browser/rule-form/useRulePreview.ts` — `core.corrections.previewMatches`.
  - [ ] `pages/transactions/useTransactionsPage.ts` — `core.entities.list`.
  - [ ] `components/ConfidenceSlider.tsx` — `core.corrections.adjustConfidence`.
  - [ ] `components/imports/RulePicker.tsx` — `core.corrections.list`.
  - [ ] `components/imports/hooks/useProposalGeneration.ts` — `core.corrections.analyzeCorrection`.
  - [ ] `components/imports/hooks/usePreviewEffects.ts` — `core.corrections.previewChangeSet`.
  - [ ] `components/imports/hooks/useApplyRejectMutations.ts` — `core.corrections.{rejectChangeSet,reviseChangeSet}`.
  - [ ] `components/imports/hooks/bulk-assignment/use-accept.ts` — `core.entities.list`.
  - [ ] `components/imports/tag-rule-dialog/useTagRuleProposal.ts` — `core.tagRules.proposeTagRuleChangeSet`.
  - [ ] `components/imports/tag-rule-dialog/useTagRuleMutations.ts` — `core.tagRules.{applyTagRuleChangeSet,rejectTagRuleChangeSet}`.
  - [ ] `components/imports/correction-proposal/rule-manager/useBrowseRules.ts` — `core.corrections.listMerged`.
  - [ ] `components/imports/correction-proposal/workflow/useWorkflowHooks.ts` — `core.corrections.proposeChangeSet`.
- [ ] No `trpc.core.*` reference remains under `packages/app-finance/src/`.
- [ ] No import of `@pops/api-client` remains under `packages/app-finance/src/`.
      The `package.json` dependency drop is US-04's deliverable.
- [ ] Cross-pillar `utils.invalidate()` chains in the 9 audit-flagged
      `useUtils()` files split per pillar: `usePillarUtils('finance')` for
      `finance.*` invalidations and `usePillarUtils('core')` for `core.*`
      invalidations. Two `utils.invalidate()` calls in one hook is the
      expected shape; no unified-cross-pillar utils surface is introduced.
- [ ] Multi-call sites (`useRuleFormState.ts` reads `core.corrections.*` +
      `core.entities.list` in the same hook) are migrated as two independent
      `usePillarQuery('core', …)` calls. `isLoading` / error aggregation is
      hand-rolled per the Option A convention. These sites are explicitly
      flagged in US-03's post-mortem.
- [ ] Type-only imports from `@pops/api/modules/core/**` remain — PRD-244 only
      addresses call-site swaps. The contract-package re-export work is
      tracked by PRD-227 / PRD-153 separately.
- [ ] Test mocks flip from `@pops/api-client` to the SDK module per the
      existing PRD-227 pattern.
- [ ] `pnpm --filter @pops/app-finance typecheck/test/build` passes clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The 24 pillar-local `trpc.finance.*` sites are already on the SDK from
  PRD-227's batch 1 (see PR
  [#3146](https://github.com/knoxio/pops/pull/3146)). This US only touches
  the 23 deferred cross-pillar sites — leave the migrated batch-1 sites
  alone.
- No optimistic updates, no suspense, no infinite queries — same shape as
  US-01. Mechanical migration.
- `useRuleFormState.ts` is the cleanest multi-call site to flag in the US-03
  post-mortem: if the hook ends up with three `usePillarQuery` calls and a
  hand-rolled `isLoading = a || b || c`, that's the Option B evidence. If it
  reads naturally, Option A wins.
- Worktree quirk: `pnpm install --frozen-lockfile` before husky.
