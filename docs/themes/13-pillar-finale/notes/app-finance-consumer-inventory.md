# app-finance Consumer Inventory (PRD-227 follow-up)

Static audit of `packages/app-finance/src/` for tRPC consumer call sites that will
need to be cut over to per-pillar SDKs as part of the finale (PRD-228 dynamic
pillar registration and the planned `@pops/finance-sdk` / `@pops/core-sdk`
clients).

This document is **audit-only**. No migration in this PR. Subsequent PRs will
move trivial call sites first, then medium, then risky.

## Summary

| Metric                                              | Value   |
| --------------------------------------------------- | ------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **47**  |
| Files containing at least one call site             | **26**  |
| `trpc.useUtils()` consumers (cache invalidation)    | 9 files |
| Calls into `trpc.finance.*` (pillar-local)          | **24**  |
| Calls into `trpc.core.*` (cross-pillar)             | **23**  |
| Direct `getDrizzle()` usage                         | 0       |
| Raw `fetch('/trpc/…')` usage                        | 0       |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 0       |
| `useSuspenseQuery` / `useInfiniteQuery`             | 0       |

The package consumes `@pops/api-client` (the monorepo-wide tRPC client) and
imports `AppRouter` plus several `@pops/api/modules/**` type modules. Type-only
imports from `@pops/api/modules/**` are listed for completeness in the section
below but are not call-site work — they will be replaced by SDK type re-exports
when the contract packages ship.

## Triage

| Bucket      | Count | Definition                                                                                                       | Notes                                                                |
| ----------- | ----- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Trivial** | 24    | Single-pillar `trpc.finance.*` call, ≤5 LOC delta, plain query or mutation with `utils.invalidate` only          | Migrate first via the planned `@pops/finance-sdk` React adapter.     |
| **Medium**  | 23    | `trpc.core.*` call (cross-pillar, depends on core SDK), or call inside a `useUtils()`-invalidation chain crossing routers | Blocked on `@pops/core-sdk` ship; mechanical once it lands.          |
| **Risky**   | 0     | Optimistic updates, suspense, infinite queries, or any cross-pillar coordination                                 | None in this package.                                                |

Total trivial + medium + risky = 47 (matches call-site count).

## Call sites by area

### `trpc.finance.*` (Trivial, 24)

- `pages/DashboardPage.tsx` — `finance.transactions.list`, `finance.budgets.list`.
- `pages/TransactionsPage.tsx` — `finance.transactions.update`.
- `pages/transactions/useTransactionsPage.ts` — `finance.transactions.list`, `finance.transactions.availableTags`.
- `pages/transactions/useTransactionMutations.ts` — `finance.transactions.{create,update,restore,delete}`.
- `pages/budgets/useBudgetsPage.ts` — `finance.budgets.{create,update,delete,list}`.
- `pages/wishlist/useWishlistPage.ts` — `finance.wishlist.{create,update,delete,list}`.
- `components/imports/final-review/useFinalReview.ts` — `finance.imports.commitImport`.
- `components/imports/processing/useProcessing.ts` — `finance.imports.processImport`, `finance.imports.getImportProgress`.
- `components/imports/hooks/useTransactionReview.ts` — `finance.imports.reevaluateWithPendingRules`.
- `components/imports/review/ReviewDialogs.tsx` — `finance.imports.reevaluateWithPendingRules`.
- `components/imports/tag-review/useTagReviewState.ts` — `finance.transactions.availableTags`.
- `components/imports/correction-proposal/rule-manager/useRuleManagerHooks.ts` — `finance.transactions.listDescriptionsForPreview`.

### `trpc.core.*` (Medium, 23)

These all flow through `core` routers (`corrections`, `tagRules`, `entities`) and
must wait on the cross-pillar `@pops/core-sdk` to ship before they can be moved.

- `pages/entities/useEntitiesPage.ts` — `core.entities.{create,update,delete,list}`.
- `pages/rules-browser/useRulesBrowserModel.ts` — `core.corrections.{delete,list}`.
- `pages/rules-browser/rule-form/useRuleFormState.ts` — `core.corrections.{createOrUpdate,update}`, `core.entities.list`.
- `pages/rules-browser/rule-form/useRulePreview.ts` — `core.corrections.previewMatches`.
- `pages/transactions/useTransactionsPage.ts` — `core.entities.list`.
- `components/ConfidenceSlider.tsx` — `core.corrections.adjustConfidence`.
- `components/imports/RulePicker.tsx` — `core.corrections.list`.
- `components/imports/hooks/useProposalGeneration.ts` — `core.corrections.analyzeCorrection`.
- `components/imports/hooks/usePreviewEffects.ts` — `core.corrections.previewChangeSet`.
- `components/imports/hooks/useApplyRejectMutations.ts` — `core.corrections.{rejectChangeSet,reviseChangeSet}`.
- `components/imports/hooks/bulk-assignment/use-accept.ts` — `core.entities.list`.
- `components/imports/tag-rule-dialog/useTagRuleProposal.ts` — `core.tagRules.proposeTagRuleChangeSet`.
- `components/imports/tag-rule-dialog/useTagRuleMutations.ts` — `core.tagRules.{applyTagRuleChangeSet,rejectTagRuleChangeSet}`.
- `components/imports/correction-proposal/rule-manager/useBrowseRules.ts` — `core.corrections.listMerged`.
- `components/imports/correction-proposal/workflow/useWorkflowHooks.ts` — `core.corrections.proposeChangeSet`.

### Type-only imports (no call-site work, listed for tracking)

`@pops/api/modules/finance/imports`, `@pops/api/modules/finance/transactions/types`,
`@pops/api/modules/finance/budgets/types`, `@pops/api/modules/core/corrections/types`,
`@pops/api/modules/core/corrections/pure-service`, `@pops/api/modules/core/entities/types`,
`@pops/api/modules/core/tag-rules/types`. ~30 files import types only — these will
be re-exported from `@pops/finance-contract` / `@pops/core-contract`.

## Migration ordering

1. **Trivial (24)** — once `@pops/finance-sdk` React adapter ships, swap
   `trpc.finance.*` for the equivalent SDK hook. Tests already mock
   `@pops/api-client`; mocks will need to flip to the SDK module.
2. **Medium (23)** — once `@pops/core-sdk` ships, move `trpc.core.*` calls in
   the same mechanical pass. Watch for `utils.invalidate()` chains: nine files
   pull `trpc.useUtils()` and invalidate sibling queries across both `finance`
   and `core` namespaces. Either the SDKs must expose a unified invalidation
   surface or these chains need to be split per-namespace.
3. **Risky (0)** — nothing in this package is blocked by SDK gaps for
   suspense, optimistic updates, or infinite queries.

## Caveats / unknowns

- The audit excludes test files (`*.test.ts`, `*.test.tsx`, `*.stories.tsx`).
  Tests currently mock `@pops/api-client`; they will need to switch to the SDK
  module name when each call site is migrated.
- Type-only imports from `@pops/api/modules/**` are not counted as call sites
  but are a real coupling and must be re-exported by the contract packages.
- `trpc.useUtils()` is counted at the file level, not per invalidation
  expression. Some files invalidate up to four sibling queries.
