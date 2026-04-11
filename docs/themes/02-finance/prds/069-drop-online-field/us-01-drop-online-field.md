# US-01: Delete the `online` field from import pipeline and UI

> PRD: [069 — Drop the online transaction field](README.md)

## Description

As a maintainer, I want the `online` boolean removed from every layer of the import pipeline so that "online vs in-person" is expressed only as a tag through the existing tag-rule system. This eliminates a parallel taxonomy and a hardcoded heuristic that quietly mis-categorised mixed-mode merchants.

## Acceptance Criteria

- [x] `online` is removed from `parsedTransactionSchema` and `confirmedTransactionSchema` in `apps/pops-api/src/modules/finance/imports/types.ts`.
- [x] `detectOnline()` is deleted from `apps/pops-api/src/modules/finance/imports/transformers/amex.ts` and the Amex parser no longer emits `online`.
- [x] No other CSV transformer (ANZ, ING, Up Bank) emits `online` (none do today; this is a verification step).
- [x] The duplicate `detectOnline()` and its caller in `packages/app-finance/src/components/imports/ColumnMapStep.tsx` are deleted.
- [x] The "Online transaction" checkbox is removed from `EditableTransactionCard.tsx` and the `editedFields.online` field is removed from local state.
- [x] The Globe/Store badge block is removed from `TransactionCard.tsx`.
- [x] `ReviewStep.tsx` and `TagReviewStep.tsx` no longer reference `online` when constructing confirmed-transaction payloads.
- [x] All Amex transformer tests in `transformers/amex.test.ts` that asserted on `online` are updated to drop those assertions (or rewritten if the test was specifically about the heuristic).
- [x] Import service / router / e2e tests (`service.test.ts`, `router.test.ts`, `imports.e2e.test.ts`) no longer reference `online` in payloads or assertions.
- [x] The `not.toHaveProperty("online")` assertion in `transactions.test.ts` is removed (no longer meaningful — the field is gone everywhere).
- [x] `pnpm --filter @pops/api typecheck` and `pnpm --filter @pops/api test` pass.
- [x] `pnpm --filter @pops/app-finance typecheck` and `pnpm --filter @pops/app-finance test` pass.
- [ ] An end-to-end import (CSV → review → confirm) completes without referencing `online` anywhere.

## Notes

- This is a single atomic deletion, not a deprecation. There is no persisted data to migrate — the field never reached the database — so a hard removal in one PR is the right call.
- The replacement mechanism (tag rules) already exists in `transaction_tag_rules` and its router/service. Nothing needs to be added there.
- After this US lands, a user who wants the deleted Amex heuristic back creates a tag rule themselves. That is the entire migration path.
- The blast radius punch list is captured in the parent PRD's overview; refer to it when verifying the work is complete.
