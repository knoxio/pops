# PRD-030: Local-First Import State Layer

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: Done

## Overview

Build a local-first state layer in zustand that buffers all entity creations and rule changes (ChangeSets) in memory during the import wizard. Nothing touches the database until a final explicit commit step. The store provides a merged view of DB state + pending local state so that all matching, preview, and UI components operate against a single coherent dataset.

**Note:** `TagReviewStep` no longer calls `executeImport` — `commitImport` on Final Review is the single write path (US-10 shipped in knoxio/pops#1757).

## Data Model

All state is client-side only, held in zustand slices within `importStore.ts`.

### PendingEntity

| Field  | Type     | Notes                                     |
| ------ | -------- | ----------------------------------------- |
| tempId | `string` | Format `temp:entity:{uuid}`               |
| name   | `string` | User-provided entity name                 |
| type   | `string` | Entity type (e.g. `merchant`, `employer`) |

### PendingChangeSet

| Field     | Type        | Notes                                                      |
| --------- | ----------- | ---------------------------------------------------------- |
| tempId    | `string`    | Format `temp:changeset:{uuid}`                             |
| changeSet | `ChangeSet` | The approved ChangeSet object                              |
| appliedAt | `string`    | ISO timestamp of local approval                            |
| source    | `string`    | Origin context (e.g. `correction-proposal`, `manual-edit`) |

### Derived State

- **Merged rule set** (`CorrectionRow[]`): computed by applying all `PendingChangeSet` entries in order to the DB-fetched rules via `applyChangeSetToRules`.
- **Merged entity list** (`Entity[]`): DB entities + pending entities adapted to the `Entity` interface, deduplicated by name (pending wins).

## API Surface

No new backend endpoints. All operations are zustand store actions and pure functions.

### Store Actions

| Action                   | Signature                           | Notes                                          |
| ------------------------ | ----------------------------------- | ---------------------------------------------- |
| `addPendingEntity`       | `(entity: PendingEntity) => void`   | Validates name uniqueness against DB + pending |
| `listPendingEntities`    | `() => PendingEntity[]`             | Returns all buffered entities                  |
| `removePendingEntity`    | `(tempId: string) => void`          | Removes by temp ID                             |
| `addPendingChangeSet`    | `(entry: PendingChangeSet) => void` | Appends to ordered list                        |
| `listPendingChangeSets`  | `() => PendingChangeSet[]`          | Returns ordered list                           |
| `removePendingChangeSet` | `(tempId: string) => void`          | Removes by temp ID, triggers re-merge          |

### Pure Functions

| Function                | Signature                                                                      | Notes                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `computeMergedRules`    | `(dbRules, pendingChangeSets) => CorrectionRow[]`                              | Folds `applyChangeSetToRules` over each pending ChangeSet in order. Memoized. |
| `computeMergedEntities` | `(dbEntities, pendingEntities) => Entity[]`                                    | Combines DB + pending, deduplicates by name (pending wins).                   |
| `buildCommitPayload`    | `(pendingEntities, pendingChangeSets, confirmedTransactions) => CommitPayload` | Resolves temp entity IDs, validates referential integrity.                    |

## Business Rules

- No DB writes occur during Steps 1–5 of the import wizard. Entity creation, rule changes, and ChangeSet approvals are all buffered locally. Step 6 performs the single write via `commitImport` (PRD-031).
- Pending entities receive temp IDs (`temp:entity:{uuid}`) that must be resolved to real DB IDs at commit time.
- The merged rule set is the single source of truth for all matching, preview, and re-evaluation during the import session.
- When a pending entity is referenced by a pending rule, the rule stores the temp entity ID. The commit step resolves both in the correct dependency order (entities first, then rules).
- Re-evaluation after a local ChangeSet approval must use the full merged rule set, not just DB rules.
- Entity name uniqueness is enforced across both DB entities and pending entities.

## Edge Cases

| Case                                                                       | Behaviour                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Multiple ChangeSets reference the same rule                                | Applied in insertion order; later ChangeSets see cumulative effect of earlier ones                           |
| User creates entity, then creates rule referencing it                      | Rule stores temp entity ID; commit resolves entity first, then patches rule with real ID                     |
| Pending entity name collides with DB entity                                | Pending entity wins in the merged list; UI shows one entry with the pending version                          |
| All pending ChangeSets removed                                             | Merged rule set reverts to DB-only rules; re-evaluation uses DB rules                                        |
| Browser refresh during import                                              | All pending state is lost; user must restart the import wizard (explicitly accepted trade-off)               |
| Pending ChangeSet references a rule that a prior pending ChangeSet removed | `applyChangeSetToRules` throws `NotFoundError`; the UI must prevent this by disabling conflicting operations |
| Duplicate entity name added via `addPendingEntity`                         | Rejected by uniqueness check; action is a no-op or throws                                                    |

## User Stories

| #   | Story                                                                     | Summary                                                                     | Status | Parallelisable                 |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ | ------------------------------ |
| 01  | [us-01-pending-entity-store](us-01-pending-entity-store.md)               | Zustand slice buffering entity creations with temp IDs                      | Done   | Yes                            |
| 02  | [us-02-pending-changeset-store](us-02-pending-changeset-store.md)         | Zustand slice buffering approved ChangeSets in order                        | Done   | Yes                            |
| 03  | [us-03-merged-rule-computation](us-03-merged-rule-computation.md)         | Pure function computing merged rules from DB + pending ChangeSets           | Done   | Blocked by US-02               |
| 04  | [us-04-merged-entity-list](us-04-merged-entity-list.md)                   | Pure function computing merged entities from DB + pending                   | Done   | Blocked by US-01               |
| 05  | [us-05-redirect-entity-creation](us-05-redirect-entity-creation.md)       | EntityCreateDialog writes to local store instead of tRPC                    | Done   | Blocked by US-01, US-04        |
| 06  | [us-06-redirect-changeset-approval](us-06-redirect-changeset-approval.md) | CorrectionProposalDialog stores ChangeSet locally instead of calling server | Done   | Blocked by US-02, US-03, US-07 |
| 07  | [us-07-local-re-evaluation](us-07-local-re-evaluation.md)                 | Re-evaluate transactions against merged rule set after local approval       | Done   | Blocked by US-03               |
| 08  | [us-08-preview-with-merged-rules](us-08-preview-with-merged-rules.md)     | ChangeSet previews use merged rule set as baseline                          | Done   | Blocked by US-03               |
| 09  | [us-09-commit-payload-builder](us-09-commit-payload-builder.md)           | Build structured commit payload resolving temp IDs                          | Done   | Blocked by US-01, US-02        |
| 10  | [us-10-single-commit-write-path](us-10-single-commit-write-path.md)       | Wizard uses commitImport only — no executeImport before Final Review        | Done   | —                              |

## Out of Scope

- Session storage or persistence across page reloads (explicitly traded off for simplicity)
- The commit endpoint itself (PRD-031)
- The global rule manager UI (PRD-032)
- Tag rule changes (already local in current implementation, covered by PRD-029)
- Undo/redo within the pending state (future enhancement)

## Drift Check

last checked: 2026-04-17
