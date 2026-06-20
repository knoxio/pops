# US-07: Reframe proposal prompt and surface triggering transaction in the dialog

> PRD: [028 — Correction Proposal Engine](README.md)

## Description

As a user correcting an import transaction, I want the correction proposal engine to generate rules that actually match my transactions, and I want to see the transaction I am correcting inside the proposal dialog so I can reason about why the proposed rule is shaped the way it is.

Two compounding defects surface together:

1. **The proposal prompt is framed around entity-name extraction.** `analyzeCorrection` currently asks the LLM to identify "which part of the description is the entity/merchant name", which implicitly assumes the entity name is a substring of the description. When a user creates a new entity with a name that has no textual overlap with the description (e.g. a "MEMBERSHIP FEE" row assigned to a new entity "American Express"), the model has no valid output and hallucinates — most commonly echoing the entity name back as the pattern, producing a rule that matches zero transactions.

2. **The proposal dialog never shows the triggering transaction.** The context panel renders the _derived_ signal (pattern → entity · type · location) but not the _source_ (original description, amount, date, account, the specific correction the user made). Without that breadcrumb the user cannot diagnose why a bad proposal is bad. This is already specified in the PRD overview ("the proposal UI must show the triggering transaction(s) and the user's original correction intent") but was not implemented in US-06.

## Acceptance Criteria

### Prompt reframe (`apps/pops-api/src/modules/core/corrections/lib/rule-generator.ts`)

- [x] The `analyzeCorrection` prompt is rewritten around the question "**how would we match future transactions for this entity?**" — not "which part of the description is the entity name".
- [x] The prompt explicitly states that the pattern must be a verbatim (case-insensitive) substring of the description, and that the pattern may be the entire description if no shorter stable identifier is available.
- [x] The prompt tells the model that the entity name is context only and should **not** appear in the returned pattern unless it is literally present in the description.
- [x] The prompt retains the existing guidance on match type selection (exact / prefix / contains) and keeps the ≥ 3 character minimum and uppercase normalisation for the pattern.
- [x] After parsing the AI response, `analyzeCorrection` validates that the returned `pattern` is a case-insensitive substring of the input `description`. If the substring check fails, the function logs a warning and returns `null`, so the frontend fallback (`computeFallbackPattern`) takes over.
- [x] Unit tests in `rule-generator.test.ts` cover at minimum: (a) entity name present in description → pattern extracted correctly; (b) entity name absent from description → AI response with mismatched pattern is rejected and `null` is returned; (c) AI returns the full description as the pattern → accepted.

### Triggering transaction context in the dialog (`packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`)

- [x] `CorrectionProposalDialog` accepts a new required prop `triggeringTransaction: { description: string; amount: number; date: string; account: string; location?: string | null; previousEntityName?: string | null; previousTransactionType?: "purchase" | "transfer" | "income" | null }`.
- [x] The context panel renders the triggering transaction's **raw description** prominently (this is the blocker — without the CSV string the user cannot reason about rule shape), plus amount (formatted), date, and account.
- [x] When the user's correction is a change (entity rename, type change, location override), the context panel shows a short "was → now" diff line derived from the difference between `triggeringTransaction` and `signal`. For a brand-new entity assignment (no previous entity), the line reads "assigned entity: <name>".
- [x] The caller in `ReviewStep.tsx` passes the originating transaction (plus its pre-correction entity/type snapshot) into every `generateProposal` → `CorrectionProposalDialog` path: the Create-new-for-all flow, the accept-AI-suggestion flow, the manual entity select flow, and the Save & Learn edit flow.
- [x] Unit tests in `CorrectionProposalDialog.test.tsx` cover that the triggering transaction's description, amount, and date render in the context panel, and that the "was → now" diff line reflects the user's correction.

### Rollup

- [x] PRD-028 README US table has a row for US-07 with status `Done` once the above pass.
- [x] Epic 03 and theme/roadmap status are adjusted if PRD-028 drops out of `Done` during the change.
- [x] `pnpm --filter @pops/api typecheck` / `test` and `pnpm --filter @pops/app-finance typecheck` / `test` / `lint` all pass.

## Notes

- This US is strictly bounded: it does not change the ChangeSet schema, the apply/reject flows, or the AI helper. It only tightens the initial proposal generation prompt and fills in the UI contract that PRD-028's overview already required.
- The substring validation in the backend is defence in depth: it catches any caller (current or future) that reaches `analyzeCorrection` with a mismatched entity/description pair, not just the frontend bulk-rename path that surfaced the bug.
- A manual end-to-end reproduction is trivial: import a single-row CSV with description "MEMBERSHIP FEE", click "Create new for all" on the Membership Fee group, create a new entity called "American Express", and confirm the resulting proposal uses `MEMBERSHIP FEE` (not `AMERICAN EXPRESS`) as the pattern, and that the dialog shows the triggering transaction.
