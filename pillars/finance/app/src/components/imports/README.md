# Import wizard

Eight steps that turn a bank CSV into committed transactions. Unlike the backend modules it drives, almost none of this directory carries file-level docs, so this is the orientation.

| #   | Step    | What happens                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Upload  | Pick the account first, then the bank dialect that account's institution/kind can offer (POPS-2820/2854), then the file(s). The dialect does not select a parser directly, but its label **is** stamped onto every row as `dialectAccountLabel` for display (POPS-2873); the account picked here is threaded through as `accountId` (POPS-2852), which is what dedup keys off. |
| 2   | Map     | Map CSV columns to date / description / amount / location; parse client-side into `ParsedTransaction[]` with an `accountId`-scoped SHA-256 checksum per row (POPS-2852).                                                                                                                                                                                                       |
| 3   | Process | `POST /imports/process` — dedup by checksum, then classify. Long-running, so the step polls `GET /imports/progress`.                                                                                                                                                                                                                                                           |
| 4   | Review  | Resolve `uncertain` rows: assign entities, correct matches, trigger correction proposals.                                                                                                                                                                                                                                                                                      |
| 5   | Tags    | Review suggested tags per entity group or per transaction.                                                                                                                                                                                                                                                                                                                     |
| 6   | Rules   | Confirm the tag-rule ChangeSets this import would create.                                                                                                                                                                                                                                                                                                                      |
| 7   | Commit  | `POST /imports/commit` — writes the transactions and applies every buffered ChangeSet.                                                                                                                                                                                                                                                                                         |
| 8   | Summary | Counts for what was committed.                                                                                                                                                                                                                                                                                                                                                 |

## One run, several files

A batch is one bank. Every file in it is stamped with the single `dialectId` chosen on step 1, and `csv-merge.ts` refuses the batch — by file name, listing the offending columns — unless every file carries the same header set as the first. Column order is not part of that comparison; Papa Parse keys rows by header name.

Consecutive statement exports repeat the days they share, so `mergeParsedFiles` drops the overlap. It compares whole rows rather than checksums, because only at merge time are the file boundaries still visible, and the distinction depends on them: a row repeated across two files is one transaction seen twice, while a row repeated inside one file is two genuine transactions — a bank will list two identical coffees bought on the same day, and they share a canonical checksum. So a row content is kept as many times as the file that lists it most. Nothing downstream deduplicates within a batch; `partitionByChecksum` on the server only compares against what is already committed.

## Account first, then format

`account-step/import-formats.ts` derives the bank dialects a picked account can offer from its institution name and kind — not a static list of every dialect POPS knows. An account whose kind has no statement (cash, gift card) or whose institution has no parser written for it offers none, and the step says so instead of falling back to an unrelated bank list. The checksum dedup key (`@pops/finance`'s `import-dedup.ts`) is scoped to the real `accountId`, so a duplicate skipped on commit is always a duplicate _of that account_ — never a collision with an identical-looking charge on a different one.

## Local-first is the whole design

No transaction and no rule is written before step 7. Every entity creation, correction ChangeSet and tag-rule ChangeSet accumulates in `../../store/importStore` as _pending_ state, and re-evaluation runs against DB rules merged with that pending set — so the user sees the effect of a rule before it exists. Abandon the import and no rule was ever created, which is why one made during review does not appear in the rules browser until commit.

A correction that never becomes a rule is worthless past this run, so no fix on step 4 is silently absorbed. Overriding an entity the matcher chose on its own — a rule, an AI guess, or one of the alias/exact/prefix/contains stages — opens the correction proposal immediately, as does assigning a row that has similar siblings anywhere in the run. Everything else (a first-time merchant on an unmatched row) still offers the rule, through a "Save & Learn" toast rather than the dialog. `findSimilar` therefore scans the `matched` bucket too: a wrong auto-match puts its whole merchant in `matched`, and scanning only uncertain/failed reported "nothing similar" for exactly the case the rule exists to fix.

"Nothing is written" is not literally true, and the exceptions bite. Rejecting a correction proposal in step 4 persists rejection feedback to finance's settings table immediately. And every `POST /imports/process` — including the re-runs the wizard fires on resume or dead-session recovery — bumps `timesApplied` on every rule that matched.

## What survives a reload

Everything, because the run is a server record: `import_drafts` in the finance pillar (finance ADR-005, `pillars/finance/docs/architecture/adr-005-import-drafts-are-server-records.md`). `hooks/useDraftWriteThrough.ts` mirrors the store's persisted slice (`../../store/import-draft-payload.ts`) into the draft named by `?draft=<id>`: at once on a step change, two seconds after anything else, and on `pagehide` with the lease released in the same request. `hooks/useDraftHydration.ts` does the reverse on open, clamping the resume step to what the payload can support. There is no browser-side copy: a reload on another device, or after clearing site data, lands on the same step with the same decisions.

The consequence worth knowing here, because it spans the store and step 1: **the `File` handles are not in the draft**, since they are not serialisable and the file is not stored. On resume there is nothing to compare against, so re-selecting even the byte-identical CSVs reads as a new batch and cascades a downstream reset over the work the resume just restored. Only `sourceFileNames` survives, to label the card.

Two more edges in the same area: resuming mid-processing restarts `POST /imports/process` rather than re-attaching to a server session that may still be alive, and a second tab opening the same draft is refused by the lease rather than racing on it (`code: DraftOwnedElsewhere`); it can take the draft over, after which the first tab's next write or thirty-second heartbeat is refused and it shows `ImportTakenOverNotice.tsx`, which blocks until the person takes the draft back or leaves.

## A live import

An account fed by a provider has no file: its rows arrive on their own and wait in a pending draft (finance ADR-005), classified as they land. The wizard therefore has no Upload and no Map for one — `step-labels.ts` derives the step list from the draft's source, and Back stops at Process. The first step shows what is waiting instead of a file drop (`live/LiveFeedSection.tsx`, with `Sync now` when nothing is), Process opens on the already-processed state because the staged fingerprints match, Review carries the held-back banner (`live/LiveArrivalsBanner.tsx`, read once when it opens: a count that moved under the person is what the "an open import never changes" rule exists to prevent), and Commit says what the balance checkpoint will record (`live/LiveCheckpointSection.tsx`).

Committing a live draft is what puts its rows in the ledger, and the commit does three more things in the same transaction: it writes the batch as an `api` batch, mints the balance Up reported as an `import` checkpoint dated to the newest row, and deletes the draft. The commit key is the draft id, so one draft commits once however many tabs or retries send it.

## Where a pending import is picked up

Two entry points list every draft, whoever started it, and both compose `pending/PendingImportCard.tsx`: the finance dashboard's "Pending imports" section (`../../pages/dashboard/PendingImports.tsx`, capped at five with a count) and the wizard's first step (`upload-step/ContinuePending.tsx`, all of them, above an "or start a new import" divider). Neither renders when nothing is pending. The card's one action follows the server's state: a saved draft resumes, a live one is reviewed, an open one is taken over, an unusable one can only be discarded, and the discard confirmation (`pending/DiscardPendingDialog.tsx`) says what is actually at stake: decisions only for a live draft, decisions and the file for a file draft.

## Where things live

| Concern                                                                       | Directory                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Correction proposal dialog — ops list, detail editor, impact panel, AI helper | `correction-proposal/`                               |
| Review step and its per-transaction surfaces                                  | `review/`, `transaction-card/`, `transaction-group/` |
| Column mapping and client-side parsing                                        | `column-map/`                                        |
| Multi-file schema agreement and overlap removal                               | `csv-merge.ts`                                       |
| Tag review and the tag-rule dialog                                            | `tag-review/`, `tag-rule-dialog/`                    |
| Commit step                                                                   | `final-review/`                                      |
| Data fetching, mutations, derived state                                       | `hooks/`                                             |
| Description normalization, correction helpers, preview scoping                | `lib/`                                               |

`correction-proposal/` is the largest surface here by a wide margin; the backend contract it drives is documented in `pillars/finance/src/api/modules/corrections/`.

Its impact panel answers "what does approving this change?", and the honest answer spans two populations: the rows in this import and the rows already committed. Both dialogs — the mid-import proposal and the rules browser — read the committed side from the same `useDbPreviewDescriptions` query and render the two as separate sections, because a correction rule outlives the run that created it. The server previews one combined list capped at `PREVIEW_CHANGESET_MAX_TRANSACTIONS`; `scopeAndBudget` gives the session rows first claim on that budget and spends the remainder on the database, so a large import shrinks the committed sample rather than dropping session rows. When it does, the section says so.
