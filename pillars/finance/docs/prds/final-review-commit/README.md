# Import Final Review & Commit

Status: Done — the import wizard's final step that atomically commits an entire import (new entities, correction + tag-rule changeSets, transactions) in one SQLite transaction, then retroactively reclassifies existing rows against the new rule set.

This step is the sole writer for an import. The Tag Review step no longer writes anything; `commitImport` is the only path that mutates the finance DB on import.

## Wizard placement

The import wizard is an 8-step flow: Upload → Map → Process → Review → Tags → Rules → **Commit (Final Review)** → Summary. Final Review is step 7, Summary is step 8. `nextStep` is capped at 8.

- "Back" from Final Review returns to Rules; the user can keep going back to edit any prior step.
- On a successful commit the wizard auto-advances to Summary (no inline result panel, no manual Continue). The commit result lives in the import store (`commitResult`); Summary reads it.
- Direct navigation to Summary without a commit is blocked by a `!commitResult` guard (renders an empty state).

## Data model

The commit operates entirely on existing finance tables (`transactions`, `transactionCorrections` for classification rules, tag-rule + tag-vocabulary tables). It introduces no schema of its own. New entities are **contacts-pillar** rows, not finance rows — they are created via the contacts client, not a local `entities` insert.

Pending entities use client-generated temp IDs of the form `temp:entity:{uuid}`. These appear in changeSet ops (`data.entityId`) and on transactions (`entityId`), and must be resolved to real contact IDs before any write that references them.

## REST API surface

`POST /imports/commit` — `commitImport`. Body `CommitPayload`, returns `{ data: CommitResult, message }`.

```
CommitPayload {
  entities:           PendingEntity[]   // { tempId: "temp:entity:{uuid}", name, type }  default []
  changeSets:         ChangeSet[]       // correction (classification) rule changeSets   default []
  tagRuleChangeSets:  TagRuleChangeSet[]                                                  default []
  transactions:       ConfirmedTransaction[]
}

CommitResult {
  entitiesCreated:               number   // counts only real inserts, not reused contacts
  rulesApplied:                  { add, edit, disable, remove }
  tagRulesApplied:               number
  transactionsImported:          number
  transactionsFailed:            number
  failedDetails:                 { checksum: string|null, error: string }[]
  retroactiveReclassifications:  number
}
```

## Commit ordering and atomicity

1. **Pre-create pending contacts** (network, BEFORE the SQLite transaction). Each create-or-fetch-by-name carries `{ name, type }` and is idempotent: a 409 dup-name fetches the existing contact so a retry after a rolled-back finance tx reuses it. This builds the `tempId → contactId` map. `entitiesCreated` counts only contacts that were actually inserted, not reused ones. A contacts-pillar failure throws here, before the transaction opens, so nothing is half-committed.
2. Open one `db.transaction`. Inner phases nest as savepoints (the same tx handle is threaded into every service):
   - apply correction changeSets (temp IDs resolved), counting `add/edit/disable/remove`;
   - apply tag-rule changeSets (temp IDs resolved), upserting each referenced tag into the vocabulary as `user`, counting total ops;
   - write transactions (temp entity IDs resolved), per-row try/catch so one bad row is recorded in `failedDetails` rather than aborting the batch;
   - retroactive reclassification of existing rows.
3. Anything that throws inside the transaction rolls back the entire commit.

## Retroactive reclassification

After the rules are committed, every existing transaction is re-evaluated against the full current rule set (ordered by priority, then id) using the corrections module's pure `findMatchingCorrectionFromRules`.

- Transactions imported in **this** commit are excluded by checksum (`notInArray`) — they were already classified with the new rules.
- Processed in batches of 500 (offset-paged) to bound memory.
- A row is updated only if its classification actually changed — entity, type, or location. Unchanged matches are not written. `retroactiveReclassifications` counts only the rows that changed.
- Type-only rules (transfer/income with no entity) reclassify with no entity: such a match sets the new type and clears the entity to `null`, and counts toward the reclassification total — consistent with the corrections engine treating type-only corrections as a terminal `matched` result.
- If there are zero rules the pass is skipped and the count is 0.

## Final Review UI

Read-only summary of all pending changes, sourced purely from the client-side import stores (no API calls until commit):

- New entities (name + type), classification-rule changeSets and tag-rule changeSets (op counts), transaction count with a matched/corrected/manual/skipped breakdown, and tag-assignment counts.
- Sections collapse; a section with zero items is hidden. Empty overall state shows "No pending changes to review."
- "Approve & Commit All" builds the payload from the stores and calls `commitImport`. While in flight the button shows a spinner and both it and "Back" are disabled (no double-submit). On error a "Commit failed" panel shows the message and re-enables for retry.

## Summary UI (post-commit)

Reads `CommitResult` from the store:

- Cards: entities created, rules applied (correction + tag-rule ops summed), transactions imported, transactions failed.
- "Retroactive Reclassifications" section: reads "N existing transaction(s) were reclassified…" or "No existing transactions affected." when the count is 0 (never hidden).
- A "Failed Transactions" list (checksum prefix + error) when `failedDetails` is non-empty.

## Business rules

- Commit is atomic — partial writes never persist.
- Temp IDs are resolved exactly once (during contact pre-create) and substituted everywhere downstream.
- The user must explicitly click "Approve & Commit All"; there is no auto-commit.

## Validation & edge cases

`validateCommitPayload` runs before the transaction opens and rejects: duplicate temp IDs, duplicate (case-insensitive) entity names, and any temp ID referenced by a changeSet op or a transaction that has no matching pending entity. `ValidationError` → 400.

| Case                                              | Behaviour                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Only transactions, no entities/rules              | Entity + rule phases skipped; transactions written.                                                    |
| Temp entity used by both a rule and a transaction | Resolved once, reused by both writes.                                                                  |
| Reclassification finds zero affected              | Commit succeeds; count 0; Summary shows "No existing transactions affected."                           |
| Single transaction write fails                    | Recorded in `failedDetails`; commit continues for the rest.                                            |
| Commit throws inside the tx                       | Whole tx rolls back; user sees the error and can retry (contacts already created are reused on retry). |
| Contacts pillar down                              | Pre-create throws before the tx opens; nothing written.                                                |
| Very large reclassification (10k+)                | Batched 500/page.                                                                                      |

## Acceptance criteria

- [x] `POST /imports/commit` accepts `CommitPayload` (entities, changeSets, tagRuleChangeSets, transactions) and returns `{ data: CommitResult, message }`.
- [x] All finance writes run inside one SQLite transaction; any failure rolls everything back.
- [x] Pending contacts are pre-created outside the tx via the contacts client; the resolved `tempId → contactId` map feeds the synchronous tx; `entitiesCreated` counts only real inserts.
- [x] Correction changeSets applied via `applyChangeSet`, counted by add/edit/disable/remove; tag-rule changeSets applied with referenced tags upserted into the vocabulary, counted in `tagRulesApplied`.
- [x] Transactions written with temp entity IDs resolved; a failed row lands in `failedDetails` without aborting the batch.
- [x] Zero entities or zero changeSets skip their phases without error.
- [x] `validateCommitPayload` rejects duplicate temp IDs, duplicate entity names, and dangling temp-id references with a 400 before any write.
- [x] Retroactive reclassification re-evaluates existing rows (excluding this batch by checksum) against the full rule set via `findMatchingCorrectionFromRules`, in 500-row batches.
- [x] Only rows whose entity/type/location changed are updated; `retroactiveReclassifications` counts only those; type-only rules clear the entity and still count.
- [x] Reclassification runs inside the commit tx; its failure rolls back the whole commit.
- [x] Wizard is 8 steps (Final Review = 7, Summary = 8); `nextStep` capped at 8; Tag Review no longer writes anything.
- [x] Final Review shows a read-only, collapsible summary from the local stores; empty sections hidden.
- [x] "Approve & Commit All" disables itself + Back while in flight, shows a spinner, surfaces errors with retry, and auto-advances to Summary on success.
- [x] Summary reads `CommitResult` from the store (no refetch), shows the retroactive section even at 0, and lists failed-transaction details when present.
- [x] Summary is guarded by `!commitResult` against direct navigation.
