# Local-First Import State Layer

> Status: Done — the live re-evaluation and preview paths run server-side (pending-aware endpoints), not the client-side merge engine the original design imagined. The unwired client-side `computeMergedRules` + `reevaluateTransactions` primitives remain as building blocks; the "zero-round-trip client re-eval/preview" ambition is in [ideas/client-side-import-reeval.md](../../ideas/client-side-import-reeval.md).

The import wizard buffers every entity creation, correction rule change, and tag-rule change in a client-side zustand store. Nothing is written to the finance DB during steps 1–5. Step 6 (Final Review) performs one atomic `POST /imports/commit` that creates entities, applies both kinds of ChangeSets, and inserts the confirmed transactions. A browser refresh mid-import discards all buffered state — explicitly accepted.

Re-evaluation and impact previews during review are computed server-side against `DB rules + pending ChangeSets` (the server merges), so a pending edit can target a rule outside the client's paginated view without breaking.

## Data Model (client-side only, `app/src/store/importStore.ts`)

Three pending slices, each entry carrying a deterministic temp id:

| Type                      | Fields                                                                      | Temp id format          |
| ------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| `PendingEntity`           | `tempId`, `name`, `type` (`company`/`person`/`government`/`bank`)           | `temp:entity:{uuid}`    |
| `PendingChangeSet`        | `tempId`, `changeSet` (correction `ChangeSet`), `appliedAt` (ISO), `source` | `temp:changeset:{uuid}` |
| `PendingTagRuleChangeSet` | `tempId`, `changeSet` (`TagRuleChangeSet`), `appliedAt` (ISO), `source`     | `temp:tagrules:{uuid}`  |

Derived (pure, memoized in `app/src/lib/merged-state.ts`):

- `computeMergedEntities(dbEntities, pendingEntities) => Entity[]` — pending adapted to the `Entity` shape (tempId as id, empty aliases), DB entries colliding by case-insensitive name are dropped (pending wins), result sorted by name.
- `computeMergedRules(dbRules, pendingChangeSets) => Correction[]` — folds `applyChangeSetToRules` over each pending ChangeSet in insertion order on the API `Correction` shape. Building block for the client-side engine; the live review path uses the server endpoint instead.

## REST API Surface (`pillars/finance`)

The store itself owns no endpoints. The import flow it drives uses:

- `POST /imports/process` — dedup + entity matching; returns `{ sessionId }` to poll.
- `GET  /imports/progress?sessionId=` — poll session progress.
- `POST /imports/entities` — create entity server-side (used outside the buffered flow; the wizard buffers instead).
- `POST /imports/reevaluate-pending` — re-evaluate a session against `DB rules + pendingChangeSets`; no DB writes. Drives review after every pending-changeset change.
- `POST /corrections/preview-changeset` — server-side before/after impact preview for a proposed ChangeSet, pending-aware.
- `POST /imports/commit` — the single write path (entities → correction ChangeSets → tag-rule ChangeSets → transactions, atomic).

`executeImport` (`POST /imports/execute`) and `applyChangeSetAndReevaluate` (`POST /imports/apply-changeset-reevaluate`) still exist on the contract but are NOT used by the buffered wizard write path.

## Commit Payload (pure, `app/src/lib/commit-payload.ts`)

`buildCommitPayload(pendingEntities, pendingChangeSets, pendingTagRuleChangeSets, confirmedTransactions) => CommitPayload` where `CommitPayload = { entities, changeSets, tagRuleChangeSets, transactions }`.

- Validates referential integrity: any `temp:entity:*` referenced by a ChangeSet op's `entityId` (correction or tag-rule) must exist in `pendingEntities`, else throws a structured `DanglingEntityRefError { type, tempId, changeSetTempId }`.
- ChangeSet order in the payload matches pending-store insertion order; the commit endpoint applies them in that order after resolving temp entity ids to real DB ids.
- Confirmed transactions referencing a temp entity id are passed through intact for the endpoint to resolve.
- Returns a shallow snapshot (spread copies), relying on the store's replace-not-mutate pattern for isolation.

## Business Rules

- No DB writes during steps 1–5. Entity creation, correction-rule changes, and tag-rule changes are buffered locally; step 6's `commitImport` is the only write.
- Entity name uniqueness is enforced case-insensitively across both DB and pending entities at `addPendingEntity`.
- Pending ChangeSets are an ordered list; later ChangeSets see the cumulative effect of earlier ones (`removePendingChangeSet` preserves relative order of the rest).
- Re-evaluation after a pending-changeset change uses `DB rules + all pending ChangeSets`, merged server-side, so edits to rules outside the client's paginated list still resolve.
- A ChangeSet referencing a pending entity stores the temp id as-is; only commit resolves it (entities first, then rules).
- Online-vs-in-person classification is never a transaction field — it is a normal tag applied through tag-rule ChangeSets, the same one mechanism as any other tag.

## Edge Cases

| Case                                                | Behaviour                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pending entity name collides with a DB entity       | Pending wins; merged list shows one entry (the pending version)              |
| Entity created, then a rule references it           | Rule stores the temp id; commit resolves entity first, then patches the rule |
| Multiple ChangeSets touch the same rule             | Applied in insertion order; later see the cumulative effect                  |
| All pending ChangeSets removed                      | Server re-eval reverts to DB-only rules                                      |
| ChangeSet references a temp entity that was removed | `buildCommitPayload` throws `DanglingEntityRefError`; commit is blocked      |
| Browser refresh mid-import                          | All buffered state lost; user restarts the wizard (accepted)                 |

## Acceptance Criteria

- [x] `pendingEntities`/`pendingChangeSets`/`pendingTagRuleChangeSets` slices exist with add/list/remove actions and a `reset`; `addPendingEntity` mints `temp:entity:{uuid}` and rejects case-insensitive name collisions against both pending and a supplied DB list (`importStore.test.ts`).
- [x] `addPendingChangeSet`/`addPendingTagRuleChangeSet` append ordered entries with `appliedAt` + `source`; removal preserves order of the remainder.
- [x] `computeMergedEntities` adapts pending to `Entity`, drops DB collisions (pending wins), sorts by name, memoizes by input reference; consumed live by bulk-assignment accept (`use-accept.ts`) (`merged-state.test.ts`).
- [x] `computeMergedRules` folds `applyChangeSetToRules` in order, returns DB rules unchanged (same reference) when no pending, memoizes by input reference.
- [x] `EntityCreateDialog` writes via `addPendingEntity` (no server mutation), surfaces inline validation on duplicates, and calls back with the temp id (`EntityCreateDialog.test.tsx`).
- [x] Correction "Apply" buffers the ChangeSet via `addPendingChangeSet` (`source: 'correction-proposal'` / `'browse-rule-manager'`) with no server rule write; pending entity refs stored as temp ids.
- [x] Changing the pending-changeset list triggers `POST /imports/reevaluate-pending` and updates `processedTransactions` from the server result (`useTransactionReview.ts`).
- [x] ChangeSet impact preview uses the pending-aware `POST /corrections/preview-changeset`, reflecting prior pending ChangeSets in the "before" column.
- [x] `buildCommitPayload` resolves/validates temp entity refs across both ChangeSet kinds, throws `DanglingEntityRefError` on dangling refs, preserves order, returns a snapshot (`commit-payload.test.ts`).
- [x] Final Review's `handleCommit` builds the payload and calls `POST /imports/commit` as the only write path; `TagReviewStep` does not call `executeImport`.
