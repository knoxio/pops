# Finance Imports #2077 Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `CorrectionProposalDialog.tsx` and `TagReviewStep.tsx` to meet strict Oxlint agent-optimal targets, then tighten/remove the `packages/app-finance/src/components/imports/**/`\* override in `.oxlintrc.json`.

**Architecture:** Keep stable entrypoints (`CorrectionProposalDialog.tsx`, `TagReviewStep.tsx`) and move mode- and feature-specific logic into feature-local folders (`correction-proposal/`_, `tag-review/_`). Only promote code into shared packages if clearly reusable beyond finance-imports.

**Tech Stack:** React + TypeScript, tRPC client (`@pops/api-client`), UI (`@pops/ui`), Oxlint, Turbo.

---

## File structure (to be created/modified)

### Create

- `packages/app-finance/src/components/imports/correction-proposal/CorrectionProposalWorkflow.tsx`
- `packages/app-finance/src/components/imports/correction-proposal/CorrectionRuleManagerDialog.tsx`
- `packages/app-finance/src/components/imports/tag-review/useTagReviewState.ts`
- `packages/app-finance/src/components/imports/tag-review/tagReviewUtils.ts`
- `packages/app-finance/src/components/imports/tag-review/EntityGroup.tsx`
- `packages/app-finance/src/components/imports/tag-review/TransactionTagRow.tsx`

### Modify

- `packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`
- `packages/app-finance/src/components/imports/TagReviewStep.tsx`
- `.oxlintrc.json`

## Task 1: Baseline + guardrails (no behavioral change)

**Files:**

- Modify: `packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`
- Modify: `packages/app-finance/src/components/imports/TagReviewStep.tsx`
- **Step 1: Capture baseline lint targets**

Run:

```bash
cd <repo-root>
pnpm -s lint -- --help >/dev/null 2>&1 || true
```

Note: we’ll use repo-level `mise lint` / `mise typecheck` at the end as the authoritative pass/fail.

- **Step 2: Verify both target files are still oversized**

Run:

```bash
cd <repo-root>
npx oxlint "packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx" "packages/app-finance/src/components/imports/TagReviewStep.tsx"
```

Expected: violations for `max-lines` / `max-lines-per-function` / `complexity` (baseline evidence).

## Task 2: Extract Correction Proposal “modes”

**Files:**

- Create: `packages/app-finance/src/components/imports/correction-proposal/CorrectionRuleManagerDialog.tsx`
- Create: `packages/app-finance/src/components/imports/correction-proposal/CorrectionProposalWorkflow.tsx`
- Modify: `packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`
- **Step 1: Create `CorrectionRuleManagerDialog` (browse mode)**

Move browse-mode render and handlers from `CorrectionProposalDialog.tsx` into a component with this signature:

```ts
export interface CorrectionRuleManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  minConfidence: number;
  onBrowseClose?: (hadChanges: boolean) => void;
}

export function CorrectionRuleManagerDialog(props: CorrectionRuleManagerDialogProps): JSX.Element;
```

Rules:

- Keep using existing hooks: `useLocalOps`, `usePreviewEffects`, `useApplyRejectMutations` only if needed; browse mode should avoid pulling in mutation state that isn’t used.
- Keep browse-mode TRPC queries in the extracted file if they are browse-only.
- Keep browse-mode local state in the extracted file (`browseSearch`, `browseSelectedRuleId`, refs).
- Ensure no exported types are required by external consumers (entrypoint keeps re-exports).
- **Step 2: Create `CorrectionProposalWorkflow` (proposal mode)**

Move proposal-mode render (proposal footer/body/subpanel/context header) into a component with this signature:

```ts
import type {
  CorrectionSignal,
  ServerChangeSet,
  TriggeringTransactionContext,
} from '../correction-proposal-shared';
import type { LocalOp } from '../correction-proposal-shared';

export interface CorrectionProposalWorkflowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  triggeringTransaction: TriggeringTransactionContext | null;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence: number;
  onApproved?: (changeSet: ServerChangeSet) => void;

  // Inputs from the entrypoint/hooks
  localOps: LocalOp[];
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  selectedOp: LocalOp | null;
  rationale: string | null;
  setRationale: (v: string | null) => void;
  updateOp: (clientId: string, mutator: (op: LocalOp) => LocalOp) => void;
  handleDeleteOp: (clientId: string) => void;
  handleAddNewRuleOp: () => void;
  handleAddTargetedOp: () => void;
  seededForSignalRef: React.MutableRefObject<string | null>;
}

export function CorrectionProposalWorkflow(props: CorrectionProposalWorkflowProps): JSX.Element;
```

Rules:

- Keep “proposal-only” UI composition in this file.
- Keep non-UI hooks (preview/mutations) inside this file if that materially shrinks the entrypoint and keeps function sizes small.
- Keep the entrypoint owning the re-export surface and prop types.
- **Step 3: Reduce `CorrectionProposalDialog.tsx` to a thin entrypoint**

Target shape:

- Keep the public `CorrectionProposalDialogProps` type and the re-exports (already present).
- Keep the propose query bootstrapping (disabled signal / `proposeInput`) at the entrypoint if required to avoid circular import churn.
- Delegate render to:
  - `CorrectionRuleManagerDialog` when `mode === "browse"`
  - `CorrectionProposalWorkflow` otherwise
- **Step 4: Validate with oxlint on the three files**

Run:

```bash
cd <repo-root>
npx oxlint "packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx" \
  "packages/app-finance/src/components/imports/correction-proposal/CorrectionRuleManagerDialog.tsx" \
  "packages/app-finance/src/components/imports/correction-proposal/CorrectionProposalWorkflow.tsx"
```

Expected: no `max-lines`, `max-lines-per-function`, `complexity` violations.

## Task 3: Decompose Tag Review into hook + components

**Files:**

- Create: `packages/app-finance/src/components/imports/tag-review/tagReviewUtils.ts`
- Create: `packages/app-finance/src/components/imports/tag-review/useTagReviewState.ts`
- Create: `packages/app-finance/src/components/imports/tag-review/EntityGroup.tsx`
- Create: `packages/app-finance/src/components/imports/tag-review/TransactionTagRow.tsx`
- Modify: `packages/app-finance/src/components/imports/TagReviewStep.tsx`
- **Step 1: Move pure helpers into `tagReviewUtils.ts`**

Move (no behavior changes):

- `groupByEntity`
- `unionTags`
- `buildTagMetaMap`

Export the types needed by consumers:

```ts
export interface ConfirmedGroup {
  entityName: string;
  transactions: ConfirmedTransaction[];
}
```

- **Step 2: Create `useTagReviewState`**

Encapsulate:

- `localTags` state
- `suggestedTagMeta` state
- `editedChecksumsRef`
- `handleAcceptAll`
- `handleApplyGroupTags`
- `handleContinue`
- tag rule dialog state + `handleOpenTagRuleDialog*` + `handleTagRuleApplied`
- `availableTags` memo + `updateTag` callback
- `previewTransactions` memo

Return a small object that `TagReviewStep.tsx` can wire into UI.

Guidelines:

- Keep each function under 60 lines by splitting small internal helpers if needed.
- Keep hook return stable (object with named properties).
- **Step 3: Extract `TransactionTagRow.tsx`**

Move the `TransactionTagRow` component and its props.

Keep imports minimal:

- `cn` and `TagEditor` usage stays (finance-only, so leave under app-finance).
- Use `buildTagMetaMap` from `tagReviewUtils`.
- **Step 4: Extract `EntityGroup.tsx`**

Move `EntityGroup` component and its props.

Rules:

- If `EntityGroup` remains >200 lines, split the “bulk apply row” into a sibling component file in the same folder (only if needed).
- Keep `toast` usage inside the component(s) that actually invoke it.
- Use `unionTags` from `tagReviewUtils`.
- **Step 5: Reduce `TagReviewStep.tsx` to thin entrypoint**

`TagReviewStep.tsx` should:

- call `useImportStore()` for top-level store selectors if the hook doesn’t already wrap it
- call `useTagReviewState(...)`
- render page header + footer navigation
- render groups via extracted `EntityGroup`
- mount `TagRuleProposalDialog` with hook-provided state/handlers
- **Step 6: Validate with oxlint**

Run:

```bash
cd <repo-root>
npx oxlint "packages/app-finance/src/components/imports/TagReviewStep.tsx" \
  "packages/app-finance/src/components/imports/tag-review/useTagReviewState.ts" \
  "packages/app-finance/src/components/imports/tag-review/tagReviewUtils.ts" \
  "packages/app-finance/src/components/imports/tag-review/EntityGroup.tsx" \
  "packages/app-finance/src/components/imports/tag-review/TransactionTagRow.tsx"
```

Expected: strict targets pass.

## Task 4: Tighten/remove `.oxlintrc.json` imports override

**Files:**

- Modify: `.oxlintrc.json`
- **Step 1: Run oxlint on imports folder**

Run:

```bash
cd <repo-root>
npx oxlint "packages/app-finance/src/components/imports/**/*.{ts,tsx}"
```

- **Step 2: Remove or narrow the override**

Preferred outcome: delete the entire override block:

```json
{
  "files": ["packages/app-finance/src/components/imports/**/*.{ts,tsx}"],
  "rules": { ... }
}
```

Fallback: narrow it to the remaining offenders (specific files), not the whole folder.

## Task 5: Verification (quality gate)

**Files:**

- (repo-wide)
- **Step 1: Run lint**

Run:

```bash
cd <repo-root>
mise lint
```

Expected: PASS.

- **Step 2: Run typecheck**

Run:

```bash
cd <repo-root>
mise typecheck
```

Expected: PASS.

## Task 6: Commit hygiene

- **Step 1: Commit refactor (code)**

```bash
cd <repo-root>
git status
git add -A
git commit -m "$(cat <<'EOF'
refactor(finance-imports): decompose correction proposal + tag review components

EOF
)"
```

- **Step 2: (Optional) Follow-up commit for `.oxlintrc.json` tightening**

```bash
cd <repo-root>
git add .oxlintrc.json
git commit -m "$(cat <<'EOF'
chore(oxlint): tighten finance imports overrides

EOF
)"
```

---

## Self-review checklist (run before calling it “done”)

- `CorrectionProposalDialog.tsx` < 200 lines and < 60 lines per function
- `TagReviewStep.tsx` < 200 lines and < 60 lines per function
- No new barrels created without clear need
- `.oxlintrc.json` override removed or narrowed to specific remaining offenders
- `mise lint` PASS
- `mise typecheck` PASS
