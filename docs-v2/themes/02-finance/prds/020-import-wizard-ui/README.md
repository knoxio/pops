# PRD-020: Import Wizard UI

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: To Review

## Overview

Build a 6-step import wizard for ingesting bank transactions. The wizard guides the user from CSV upload through entity matching review and tag assignment to final database write. State managed via Zustand store. Backend processing runs in the background with progress polling.

## Wizard Flow

```
Step 1: Upload CSV
  → Step 2: Column Mapping (auto-detect + manual)
    → Step 3: Processing (backend: dedup + match + AI, polled)
      → Step 4: Review Entities (resolve uncertain/failed matches)
        → Step 5: Tag Review (accept/edit suggested tags)
          → Step 6: Summary (import results)
```

### Step 1: Upload
- User selects CSV file (max 25 MB)
- Frontend parses with PapaParse (header: true, skip empty)
- Extracts headers and rows into Zustand store
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
- Output: `ParsedTransaction[]` stored in Zustand

### Step 3: Processing
- Calls `finance.imports.processImport` mutation (returns session ID immediately)
- Backend runs dedup + entity matching + AI categorisation in background (see PRD-021, PRD-022)
- Frontend polls `finance.imports.getImportProgress` every 1 second
- Shows progress: current step ("deduplicating", "matching", "writing"), processed count, current batch preview
- Output categorised into: matched, uncertain, failed, skipped, warnings

### Step 4: Review Entities
- Tabbed view: Matched | Uncertain | Failed | Skipped
- **Matched tab:** Read-only transaction cards with edit option
- **Uncertain tab:** AI suggestion with "Accept" button, manual entity selection dropdown, "Create Entity" dialog
- **Failed tab:** Same controls as uncertain — user can fix and promote to matched
- **Skipped tab:** Read-only table with skip reason (duplicate checksum)
- User actions:
  - Select entity from dropdown → auto-match similar transactions (toast: "Apply to N similar?")
  - Create new entity → dialog, entity created in DB, assigned to transaction(s)
  - Edit transaction → dialog for description, amount, account, entity, location, type
  - Save & Learn → creates correction pattern for future imports
  - Override type to "transfer" or "income" → entity becomes optional
- Gate: all uncertain/failed must be resolved before advancing

### Step 5: Tag Review
- Transactions grouped by entity name (collapsible, all expanded)
- Per-transaction TagEditor with autocomplete
- Pre-populated tags from Step 3 with source badges:
  - 📋 Rule (from correction pattern — tooltip shows the pattern)
  - 🤖 AI (category matched against known tags)
  - 🏪 Entity (from entity default tags)
- Group-level bulk tag application (merge semantics — never replaces individual edits)
- "Accept All Suggestions" button (top-level)
- On continue: calls `finance.imports.executeImport` → polls progress every 1.5s

### Step 6: Summary
- Displays: imported count (✅), failed count with error details (❌), skipped count (⏸️)
- Buttons: "New Import" (resets wizard), "View Transactions" (navigates to list)

## State Management (Zustand)

```typescript
interface ImportStore {
  currentStep: 1..6
  // Step 1
  file: File | null
  bankType: string
  // Step 2
  headers: string[]
  rows: Record<string, string>[]
  columnMap: { date, description, amount, location? }
  parsedTransactions: ParsedTransaction[]
  // Step 3
  processSessionId: string | null
  processedTransactions: { matched, uncertain, failed, skipped, warnings? }
  // Step 5
  confirmedTransactions: ConfirmedTransaction[]
  executeSessionId: string | null
  // Step 6
  importResult: { imported, failed, skipped } | null
  // Actions
  nextStep(), prevStep(), goToStep(n), reset()
  updateTransaction(t, updates)
  findSimilar(t)
  updateTransactionTags(checksum, tags)
}
```

## Business Rules

- Wizard resets on page load (ImportPage calls `reset()`)
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

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-wizard-scaffold](us-01-wizard-scaffold.md) | ImportWizard component, step navigation, Zustand store, progress indicator | No (first) |
| 02 | [us-02-file-upload](us-02-file-upload.md) | File input with validation + CSV parsing via PapaParse | Blocked by us-01 |
| 03 | [us-03-column-autodetect](us-03-column-autodetect.md) | Auto-detect column patterns from CSV headers | Blocked by us-02 |
| 04 | [us-04-column-manual-map](us-04-column-manual-map.md) | Manual column mapping UI with preview | Blocked by us-02 |
| 05 | [us-05-row-parsing](us-05-row-parsing.md) | Client-side row parsing: date normalization, amount inversion, location extraction, online detection, checksum generation | Blocked by us-04 |

### Processing (Step 3)

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 06 | [us-06-process-call](us-06-process-call.md) | Call processImport, receive session ID | Blocked by us-05 |
| 07 | [us-07-progress-polling](us-07-progress-polling.md) | Poll getImportProgress every 1s, show step/count/batch preview | Blocked by us-06 |

### Review (Step 4)

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 08 | [us-08-review-tabs](us-08-review-tabs.md) | Tabbed view: Matched / Uncertain / Failed / Skipped with counts | Blocked by us-07 |
| 09 | [us-09-transaction-card](us-09-transaction-card.md) | TransactionCard component: description, amount, date, entity, match type badge | Blocked by us-08 |
| 10 | [us-10-entity-dropdown](us-10-entity-dropdown.md) | Entity selection dropdown on uncertain/failed cards | Blocked by us-09 |
| 11 | [us-11-auto-match-similar](us-11-auto-match-similar.md) | When entity assigned, find similar transactions and offer "Apply to N similar?" toast | Blocked by us-10 | Done |
| 12 | [us-12-entity-creation](us-12-entity-creation.md) | "Create Entity" dialog for on-the-fly entity creation during review | Blocked by us-10 | Done |
| 13 | [us-13-edit-transaction](us-13-edit-transaction.md) | Edit dialog: modify description, amount, account, entity, location, type | Blocked by us-09 | Done |
| 14 | [us-14-save-and-learn](us-14-save-and-learn.md) | "Save & Learn" action: create correction pattern from manual entity assignment | Blocked by us-10 | Done |
| 15 | [us-15-type-override](us-15-type-override.md) | Override type to transfer/income — makes entity optional, bypasses entity validation | Blocked by us-09 | Done |
| 16 | [us-16-review-gate](us-16-review-gate.md) | Validation gate: all uncertain/failed must be resolved before advancing to Step 5 | Blocked by us-10 | Done |

### Tag Review (Step 5)

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 17 | [us-17-tag-group-view](us-17-tag-group-view.md) | Group transactions by entity name, collapsible sections | Blocked by us-16 | Done |
| 18 | [us-18-tag-source-badges](us-18-tag-source-badges.md) | Source badges on suggested tags: rule (with pattern tooltip), AI, entity | Blocked by us-17 | Done |
| 19 | [us-19-per-transaction-tags](us-19-per-transaction-tags.md) | Per-transaction TagEditor with autocomplete (server + session tags) | Blocked by us-17 | Done |
| 20 | [us-20-bulk-tag-apply](us-20-bulk-tag-apply.md) | Group-level bulk tag application (merge semantics, never replaces individual edits) | Blocked by us-19 | Done |
| 21 | [us-21-execute-import](us-21-execute-import.md) | Call executeImport, poll progress every 1.5s, show write status | Blocked by us-19 | Done |

### Summary (Step 6)

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 22 | [us-22-summary](us-22-summary.md) | Display import results (imported/failed/skipped counts), "New Import" and "View Transactions" buttons | Blocked by us-21 | Done |

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
