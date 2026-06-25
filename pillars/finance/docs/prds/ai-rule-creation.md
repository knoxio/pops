# AI Rule Creation

Status: Partial — the AI proposal surface (analyze / generate-rules / propose / revise / reject) and the approve → pending → re-evaluate → commit loop are built. Missing: confidence-threshold-gated confirmation UI, in-session re-suggestion suppression, and a background batch driver — see [ideas](../ideas/ai-rule-creation-gaps.md).

When a user corrects an uncertain transaction during import review, the finance pillar uses Claude to derive a reusable matching rule that generalises to future transactions. Every AI output is a **proposal**: nothing is written to the rules table until the user approves a bundled ChangeSet and the import commits. Each commit makes the next import smarter — more rows auto-match, manual corrections trend toward zero.

## Data Model

AI rule creation owns no tables of its own. It reads/writes the finance-owned `transaction_corrections` rule table (the same model the deterministic correction CRUD and import matcher use) via ChangeSets, and stores rejection feedback as free-form keys in finance's local settings store.

A **correction rule** (`CorrectionSchema`): `{ id, descriptionPattern, matchType, entityId, entityName, location, tags[], transactionType, isActive, priority, confidence, timesApplied, createdAt, lastUsedAt }`.

- `matchType` is `exact | contains | regex`. Patterns are normalised to uppercase with digits stripped.
- Online-vs-in-person is not a transaction field; it is a normal tag carried in `tags[]` and applied through the rule, never a dedicated column.
- A type-only correction (transfer/income) classifies with no entity and is still a terminal `matched` outcome — proposals may set `transactionType` with a null entity.

A **ChangeSet** (`ChangeSetSchema`): `{ source?, reason?, ops[] }` with at least one op; each op is `add` (full rule data), `edit` (id + partial, never `descriptionPattern`/`matchType`), `disable` (id), or `remove` (id). This is the only path to rule persistence.

Rejection feedback record (settings store, key `corrections.changeSetRejections:<matchType>:<normalizedPattern>`): `{ createdAt, userEmail, feedback, changeSet, impactSummary }`.

## REST API Surface

All under the finance pillar's `corrections.*` sub-router; AI calls reach Anthropic via the finance env key and degrade to null/fallback when no key is set.

- `POST /corrections/analyze` — one labelled transaction (`{ description, entityName, amount }`) → `{ matchType, pattern, confidence } | null`. Picks a stable merchant token, strips volatile parts; entity name is context only and is omitted from the pattern unless it appears verbatim.
- `POST /corrections/generate-rules` — batch of 1–50 transactions (`{ description, entityName, amount, account, currentTags[] }`) → `{ proposals: [{ descriptionPattern, matchType, tags[], reasoning }] }`. Available tags are loaded from existing transactions to constrain Claude's tag vocabulary.
- `POST /corrections/propose-changeset` — a correction signal (`{ descriptionPattern, matchType, entityId?, entityName?, location?, tags?, transactionType? }`) plus `minConfidence` (default 0.7) and `maxPreviewItems` (default 200) → `{ changeSet, rationale, preview: { counts, affected[] }, targetRules }`. Builds an **edit** op when a rule already exists for `(matchType, normalizedPattern)`, otherwise **add**; scans the DB for before/after impact.
- `POST /corrections/revise-changeset` — `{ signal, currentChangeSet, instruction, triggeringTransactions[] }` → AI-revised `{ changeSet, rationale, targetRules }`. Throws on AI-unavailable or schema-invalid AI output.
- `POST /corrections/reject-changeset` — `{ signal, changeSet, feedback, impactSummary? }`; records feedback (best-effort, never throws) keyed by `(matchType, normalizedPattern)`.

Approval and persistence ride the imports sub-router, not corrections:

- `POST /imports/reevaluate-pending` — re-evaluate the session against merged (DB + pending) rules; no DB writes.
- `POST /imports/commit` — the only point where ChangeSets and tag-rule ChangeSets become persistent rules.

## Business Rules

- AI output is always a proposal; rules persist only at `commitImport`, never via a mid-session DB write.
- AI is non-fatal: with no API key (or any API failure), `analyze` returns null and the frontend opens the proposal dialog with a deterministic fallback pattern (`description` uppercased, digits stripped, `contains` match). The user can still proceed.
- On approval the ChangeSet enters the local pending store; the session re-evaluates uncertain/failed rows against merged DB + pending rules and tab counts update — all before any persistence.
- `propose-changeset` adapts to the latest stored rejection feedback for the same `(matchType, pattern)`: it interprets the feedback into an adapted signal (prefer narrowing `matchType`) before building the ChangeSet.
- Cost/latency/usage for every Claude call is reported through `@pops/ai-telemetry` (`callWithLogging`) to the ai pillar; reporting is fire-and-forget and never alters caller behaviour.

## Validation Rules (analyze)

- `matchType` must be one of `exact | contains | regex`; otherwise the analysis is rejected (null).
- `pattern` length ≥ 3 characters.
- `confidence` in `[0, 1]`.
- The returned pattern must actually match the source description (exact/contains literal, regex test); a non-matching pattern is discarded → null.

## Edge Cases

| Case                                                              | Behaviour                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AI proposes a rule that already exists for `(matchType, pattern)` | Proposal becomes an `edit` op on the existing rule; impact preview shows net before/after effect |
| AI unavailable                                                    | `analyze` returns null; proposal dialog opens with the deterministic fallback signal             |
| AI returns malformed/non-matching pattern                         | Discarded; treated as AI-unavailable (fallback)                                                  |
| Prior rejection recorded for this pattern                         | Next proposal interprets the feedback and adapts the signal before building the ChangeSet        |

## Acceptance Criteria

- [x] Correcting an uncertain transaction posts `{description, entityName, amount}` to `POST /corrections/analyze` and receives `{ matchType, pattern, confidence }` or null.
- [x] `matchType` is constrained to `exact | contains | regex`; pattern ≥ 3 chars; confidence in `[0,1]`; a pattern that does not match the description is rejected.
- [x] AI failure is non-fatal: the correction still succeeds and the proposal dialog opens with a deterministic fallback (`contains`, digit-stripped uppercase pattern).
- [x] `POST /corrections/generate-rules` accepts 1–50 transactions and returns `{ proposals }` from a single AI call, with tags constrained to the existing tag vocabulary.
- [x] `POST /corrections/propose-changeset` returns a bundled ChangeSet plus a DB-scanned impact preview (counts + affected rows) and `targetRules`, choosing add vs edit by existing-rule lookup.
- [x] No silent rule writes: the user reviews the ChangeSet in `CorrectionProposalDialog`; approval stores it in the local pending store and triggers `POST /imports/reevaluate-pending`; rules persist only at `POST /imports/commit`.
- [x] After local re-evaluation, a row that previously did not match (e.g. a second branch of the same merchant) moves to `matched` against the merged rule set, and tab counts update.
- [x] `POST /corrections/reject-changeset` records feedback keyed by `(matchType, pattern)`; `propose-changeset` adapts the next proposal from that feedback.
- [x] `POST /corrections/revise-changeset` rewrites an in-progress ChangeSet from a free-text instruction and validates the AI output against the ChangeSet schema.
- [x] Every Claude call reports usage/cost to the ai pillar via `@pops/ai-telemetry`; rules written in a prior commit benefit the next import.

## Out of Scope

- AI usage tracking UI (owned by the AI pillar).
- Corrections management UI beyond the import-time proposal/browse dialog.
