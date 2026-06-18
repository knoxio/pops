# Transfer-only rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow corrections rules to classify transactions as transfer/income without an entity, and have those transactions be treated as matched in the import matching + re-evaluation flows.

**Architecture:** Extend the learned-correction application step to support “type-only” matches (transactionType set, entity absent), and ensure re-evaluation impact counting and proposal preview coverage include type-only changes.

**Tech Stack:** Node.js, tRPC, Zod, Vitest, Drizzle (SQLite).

---

### Task 1: Add failing tests for type-only learned correction behavior

**Files:**

- Modify: `apps/pops-api/src/modules/finance/imports/service.test.ts`

- [ ] **Step 1: Write failing unit test for applyLearnedCorrection transfer-only**

Add a test that seeds a correction with:

- `transactionType = "transfer"`
- `entityId = null`
- pattern matches the transaction description

Assert:

- return value is non-null
- `bucket === "matched"`
- `processed.status === "matched"`
- `processed.transactionType === "transfer"`
- `processed.entity.matchType === "learned"`
- `processed.entity.entityId` and `.entityName` are absent/undefined

- [ ] **Step 2: Run the single test to verify it fails**

Run:
`cd apps/pops-api && pnpm test --filter applyLearnedCorrection`

Expected: FAIL because current implementation returns `null` when entityId is missing.

---

### Task 2: Implement type-only learned correction support

**Files:**

- Modify: `apps/pops-api/src/modules/finance/imports/service.ts`

- [ ] **Step 1: Implement minimal logic change in applyLearnedCorrection**

When rule matches and has no entityId:

- if `correction.transactionType` is set → return matched result applying type-only fields
- else → keep falling through

- [ ] **Step 2: Run the test and confirm it passes**

Run:
`cd apps/pops-api && pnpm test --filter applyLearnedCorrection`

Expected: PASS.

---

### Task 3: Re-evaluation affectedCount counts type-only changes

**Files:**

- Modify: `apps/pops-api/src/modules/finance/imports/service.test.ts`
- Modify: `apps/pops-api/src/modules/finance/imports/service.ts`

- [ ] **Step 1: Write failing test for affectedCount when transactionType changes**

Create a `ProcessImportOutput` where an item is uncertain, then after applying a type-only correction + `reevaluateImportSessionResult`, assert:

- item moves to `matched`
- `affectedCount` increments

- [ ] **Step 2: Update changed-comparison logic to include transactionType**

- [ ] **Step 3: Run targeted tests**

Run:
`cd apps/pops-api && pnpm test --filter reevaluateImportSessionResult`

---

### Task 4: Proposal preview includes type-only diffs (coverage)

**Files:**

- Modify: `apps/pops-api/src/modules/core/corrections/corrections.test.ts` (or nearest existing tests for propose/preview impact)

- [ ] **Step 1: Add failing test asserting proposal preview includes affected items for type-only change**

Construct a signal / ChangeSet that sets `transactionType="transfer"` with no entity, and assert preview impacted items include “before vs after” with type change.

- [ ] **Step 2: Implement minimal changes (if needed)**

Only if the test fails, adjust preview/impact logic to treat type-only diffs as affected.

- [ ] **Step 3: Run core corrections tests**

Run:
`cd apps/pops-api && pnpm test --filter corrections`

---

### Task 5: Repo quality gates and docs sync

**Files:**

- Modify: `pillars/finance/docs/prds/028-correction-proposal-engine/` (only if required by doc rules for #1650 linkage)

- [ ] **Step 1: Run pops-api checks**

Run:
`cd apps/pops-api && pnpm format --check && pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 2: Run repo gates before push**

Run:
`mise lint && mise typecheck`
