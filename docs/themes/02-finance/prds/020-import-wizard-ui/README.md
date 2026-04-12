# PRD-020: Import Wizard UI

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: To Review

## Overview

Build a 7-step import wizard for ingesting bank transactions into the transaction ledger. The wizard guides the user from CSV upload through processing, review, tag confirmation, final review with commit, and summary.

The import experience must feel like a guided “cleanup session”: every unresolved item is surfaced, fixes are fast, and the system learns in a transparent, user-controlled way.

Nothing touches the database until the user explicitly commits in Step 6. All entity creations, rule changes, and tag assignments are buffered locally during Steps 1-5 (see PRD-030).

## Wizard Flow

```
Step 1: Upload CSV
  → Step 2: Column Mapping (auto-detect + manual)
    → Step 3: Processing (backend: dedup + match + AI, polled)
      → Step 4: Review Entities (resolve uncertain/failed matches)
        → Step 5: Tag Review (accept/edit suggested tags + propose tag rules)
          → Step 6: Final Review & Commit (review all pending changes, atomic commit)
            → Step 7: Summary (import results + reclassification counts)
```

### Step 1: Upload
- User selects CSV file (max 25 MB)
- Parse CSV rows client-side
- Validates: file required, CSV not empty, headers present

### Step 2: Column Mapping
- Auto-detects common column patterns (date, description, amount, location)
- User manually adjusts mapping if auto-detection is wrong
- Client-side parsing per row:
  - Date: DD/MM/YYYY → YYYY-MM-DD
  - Amount: remove currency symbols, parse float, invert sign (bank charges are positive, expenses should be negative)
  - Location: extract first line of multiline field, title-case
  - Online detection: keyword heuristic (AMAZON, PAYPAL, .COM.AU, etc.)
  - Checksum: SHA-256 of full raw CSV row (JSON stringified)
- Shows first 10 validation errors to user
- Output: list of parsed transactions ready for backend processing

### Step 3: Processing
- Calls `finance.imports.processImport` mutation (returns session ID immediately)
- Backend runs dedup + entity/type classification + AI fallback in background (see PRD-021, PRD-022, PRD-024)
- Frontend polls `finance.imports.getImportProgress` every 1 second
- Shows progress: current step ("deduplicating", "matching", "writing"), processed count, current batch preview
- Output categorised into: matched, uncertain, failed, skipped, warnings

### Step 4: Review Entities
- Tabbed view: Matched | Uncertain | Failed | Skipped
- **Matched tab:** Transaction cards that can be edited; rule-matched items must show rule provenance (see “Rule transparency”)
- **Uncertain tab:** AI suggestion with "Accept" button, manual entity selection dropdown, "Create Entity" dialog
- **Failed tab:** Same controls as uncertain — user can fix and promote to matched
- **Skipped tab:** Read-only table with skip reason (duplicate checksum)
- User actions:
  - Select entity from dropdown → auto-match similar transactions (toast: "Apply to N similar?")
  - Create new entity → buffered locally with temp ID (PRD-030 US-01), then assigned to transaction(s)
  - Edit transaction → edit description, amount, account, entity, location, and transaction type
  - Save Once → applies the fix to this import only
  - Save & Learn → opens a bundled **Correction Proposal** that the user must approve (PRD-028); on approval, ChangeSet is stored locally (PRD-030 US-06), not written to the DB
  - Manage Rules → opens the rule manager in browse mode (PRD-032 US-04) for full CRUD over all rules (DB + pending)
  - Override type to "transfer" or "income" → entity becomes optional
- Gate: all uncertain/failed must be resolved before advancing

#### Save & Learn (Correction Proposal)
“Save & Learn” does not directly create or edit rules. Instead it triggers the Correction Proposal Engine (PRD-028) which proposes a bundled ChangeSet. The user can:
- **Approve**: store the ChangeSet in the local pending store (PRD-030 US-06), then immediately re-evaluate remaining transactions using the merged rule set (DB + pending ChangeSets).
- **Reject**: provide a required feedback message; the system uses that feedback to propose a better ChangeSet.

All approved ChangeSets are deferred — no DB writes happen until Step 6.

#### Rule transparency (required)
When a transaction is matched by a learned rule, the UI must show:
- **Match source**: learned rule vs other match source
- **Rule pattern** (as stored)
- **Match type** (exact / contains / regex)
- **Confidence**

Edits to a rule-matched transaction must generate a new Correction Proposal ChangeSet rather than silently overriding the match.

### Step 5: Tag Review
- Transactions grouped by entity name (collapsible, all expanded)
- Per-transaction TagEditor with autocomplete
- Pre-populated tags from Step 3 with source badges:
  - 📋 Rule (from tag rules — tooltip shows the rule pattern)
  - 🤖 AI (suggested tags, including brand-new tags marked as New)
  - 🏪 Entity (from entity default tags)
- Group-level bulk tag application (merge semantics — never replaces individual edits)
- "Accept All Suggestions" button (top-level)
- Tag suggestions can be proposed at **group scope** (apply to all transactions in a group) and **transaction scope** (apply to one transaction). The UI must support accept/reject at both scopes, with transaction-level overrides.
- Tag rule learning is separate from entity/type correction rules. If the user chooses to learn from tag edits, it must follow the same proposal + bundled approval + reject-with-feedback model, scoped to tag rules only (PRD-029).
- On continue: advances to Step 6 (Final Review & Commit)

### Step 6: Final Review & Commit
- Displays all pending changes in a read-only summary: new entities, rule changes (grouped by ChangeSet with add/edit/disable/remove badges), transaction count, tag assignment count
- "Approve & Commit All" button triggers `finance.imports.commitImport` (PRD-031 US-03), which atomically writes entities, rules, transactions, and runs retroactive reclassification (PRD-031 US-04)
- Progress indicator during commit
- On completion: displays entity/rule/transaction/reclassification counts, then advances to Summary
- Editing goes back to the relevant earlier step

### Step 7: Summary
- Displays: imported count, failed count with error details, skipped count, retroactive reclassification count
- Buttons: "New Import" (resets wizard), "View Transactions" (navigates to list)

## State Management (Zustand)

```typescript
interface ImportStore {
  currentStep: 1..7
  // Step 1
  file: File | null
  bankType: string
  // Step 2
  headers: string[]
  rows: Record<string, string>[]
  columnMap: { date, description, amount, location? }
  parsedTransactions: ParsedTransaction[]
  parsedTransactionsFingerprint: string
  // Step 3
  processSessionId: string | null
  processedTransactions: { matched, uncertain, failed, skipped, warnings? }
  processedForFingerprint: string | null
  // Step 4 — local-first pending state (PRD-030)
  pendingEntities: PendingEntity[]
  pendingChangeSets: PendingChangeSet[]
  // Step 5
  confirmedTransactions: ConfirmedTransaction[]
  // Step 6 — commit
  commitResult: CommitResult | null
  // Step 7
  importResult: { imported, failed, skipped, reclassified } | null
  // Actions
  nextStep(), prevStep(), goToStep(n), reset()
  updateTransaction(t, updates)
  findSimilar(t)
  updateTransactionTags(checksum, tags)
  addPendingEntity(entity), removePendingEntity(tempId)
  addPendingChangeSet(entry), removePendingChangeSet(tempId)
}
```

## Business Rules

- Steps are sequential — can go back but can't skip ahead
- Step 4 gates: all uncertain/failed must be resolved to proceed
- Transfer/income type override makes entity optional
- Tag merge semantics: group-level bulk apply merges with existing tags, never replaces
- Progress auto-cleanup: backend entries deleted after 5 minutes

## Edge Cases

| Case | Behaviour |
|------|-----------|
| CSV with no header row | Error on upload — "Headers not found" |
| All transactions are duplicates | Step 4 shows only Skipped tab, nothing to review |
| AI unavailable (no API key or rate limited) | Warning displayed; transactions route to uncertain instead of failing |
| User creates entity that already exists | API returns conflict error; entity selector shows existing match |
| Browser closed during processing | Session expires after 5 minutes; user must re-import |

## User Stories

### Scaffold & Upload (Step 1-2)

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-wizard-scaffold](us-01-wizard-scaffold.md) | ImportWizard component, step navigation, Zustand store, progress indicator | Done | No (first) |
| 02 | [us-02-upload-step](us-02-upload-step.md) | File input with validation + CSV parsing via PapaParse | Done | Blocked by us-01 |
| 03 | [us-03-column-map-step](us-03-column-map-step.md) | Auto-detect column patterns from CSV headers | Done | Blocked by us-02 |
| 04 | [us-04-column-manual-map](us-04-column-manual-map.md) | Manual column mapping UI with preview | Done | Blocked by us-02 |
| 05 | [us-05-row-parsing](us-05-row-parsing.md) | Client-side row parsing: date normalization, amount inversion, location extraction, online detection, checksum generation | Done | Blocked by us-04 |

### Processing (Step 3)

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 06 | [us-06-process-call](us-06-process-call.md) | Call processImport, receive session ID | Done | Blocked by us-05 |
| 07 | [us-07-progress-polling](us-07-progress-polling.md) | Poll getImportProgress every 1s, show step/count/batch preview | Done | Blocked by us-06 |

### Review (Step 4)

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 08 | [us-08-review-tabs](us-08-review-tabs.md) | Tabbed view: Matched / Uncertain / Failed / Skipped with counts | Done | Blocked by us-07 |
| 09 | [us-09-transaction-card](us-09-transaction-card.md) | TransactionCard component: description, amount, date, entity, match type badge | Done | Blocked by us-08 |
| 10 | [us-10-entity-dropdown](us-10-entity-dropdown.md) | Entity selection dropdown on uncertain/failed cards | Done | Blocked by us-09 |
| 11 | [us-11-auto-match-similar](us-11-auto-match-similar.md) | When entity assigned, find similar transactions and offer "Apply to N similar?" toast | Done | Blocked by us-10 |
| 12 | [us-12-entity-creation](us-12-entity-creation.md) | "Create Entity" dialog for on-the-fly entity creation during review | Done | Blocked by us-10 |
| 13 | [us-13-edit-transaction](us-13-edit-transaction.md) | Edit dialog: modify description, amount, account, entity, location, type | Done | Blocked by us-09 |
| 14 | [us-14-save-and-learn](us-14-save-and-learn.md) | "Save & Learn" uses bundled proposal + approval + reject-with-feedback, then re-evaluates remaining transactions | To Review | Blocked by us-10 |
| 15 | [us-15-type-override](us-15-type-override.md) | Override type to transfer/income — makes entity optional, bypasses entity validation | Done | Blocked by us-09 |
| 16 | [us-16-review-gate](us-16-review-gate.md) | Validation gate: all uncertain/failed must be resolved before advancing to Step 5 | Done | Blocked by us-10 |
| 23 | [us-23-edit-rule-matched-transactions](us-23-edit-rule-matched-transactions.md) | Editing a rule-matched transaction triggers a bundled Correction Proposal ChangeSet (add/edit/remove rules) | Done | Blocked by us-13 |

### Tag Review (Step 5)

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 17 | [us-17-tag-group-view](us-17-tag-group-view.md) | Group transactions by entity name, collapsible sections | Done | Blocked by us-16 |
| 18 | [us-18-tag-source-badges](us-18-tag-source-badges.md) | Source badges on suggested tags: rule (with pattern tooltip), AI, entity | Done | Blocked by us-17 |
| 19 | [us-19-per-transaction-tags](us-19-per-transaction-tags.md) | Per-transaction TagEditor with autocomplete (server + session tags) | Done | Blocked by us-17 |
| 20 | [us-20-bulk-tag-apply](us-20-bulk-tag-apply.md) | Group-level bulk tag application (merge semantics, never replaces individual edits) | Done | Blocked by us-19 |
| 21 | [us-21-execute-import](us-21-execute-import.md) | Call executeImport, poll progress every 1.5s, show write status | Done | Blocked by us-19 |

### Final Review & Commit (Step 6)

See PRD-031 for the full spec and user stories for this step.

### Summary (Step 7)

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 22 | [us-22-summary](us-22-summary.md) | Display import results (imported/failed/skipped/reclassified counts), "New Import" and "View Transactions" buttons | Done | Blocked by us-21 |

US-03 and US-04 can parallelise. US-11, US-12, US-13, US-14, US-15 can parallelise after US-10. US-18 and US-19 can parallelise after US-17.

## Verification

- Full import flow works end-to-end: CSV → review → tags → database
- Duplicate CSVs are detected and skipped
- Entity matching results categorise correctly (matched vs uncertain)
- Tags from corrections, AI, and entity defaults all appear with correct source badges
- Group-level tag apply merges correctly
- Save & Learn creates correction patterns
- Progress polling shows real-time updates
- All edge cases handled gracefully

## Out of Scope

- Entity matching engine internals (PRD-021)
- Deduplication and parser internals (PRD-022)
- The matching/dedup/AI algorithms — this PRD covers the UI wrapper
