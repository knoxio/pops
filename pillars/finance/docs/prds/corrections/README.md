# Corrections (Classification Rules)

Status: Done — storage, normalization, match (exact/contains/regex), CRUD, reinforce-on-reuse, confidence auto-cleanup, type-only classification, and deterministic ChangeSet apply/preview are all live. AI proposal/revision and the import-time proposal UX are owned by sibling PRDs (`ai-rule-creation`, `correction-proposal-engine`); this PRD covers the underlying rule store and match primitives they sit on.

Learned **classification rules** for bank transactions. A rule can assign an entity (merchant/payee), classify a transaction's type (purchase / transfer / income), and/or apply a location override. Rules live in the finance-owned `transaction_corrections` table and drive the import pipeline's "learned correction" match step. Tag-rule learning is a separate mechanism (`transaction_tag_rules`, `tag-rule-proposals`) and is never coupled to classification rules.

Mutations only ever land through an approved ChangeSet (add / edit / disable / remove), applied atomically. There is no standalone rules-CRUD UI; editing happens inside the import/review flow.

## Data Model — `transaction_corrections`

| Column                | Type    | Notes                                                         |
| --------------------- | ------- | ------------------------------------------------------------- |
| `id`                  | TEXT PK | UUID, auto-generated                                          |
| `description_pattern` | TEXT    | NOT NULL — stored already-normalized                          |
| `match_type`          | TEXT    | `exact` \| `contains` \| `regex`, default `exact`             |
| `entity_id`           | TEXT    | nullable — entity to assign                                   |
| `entity_name`         | TEXT    | nullable — denormalized entity label                          |
| `location`            | TEXT    | nullable — location override                                  |
| `tags`                | TEXT    | NOT NULL, default `'[]'` — JSON array of tag slugs to suggest |
| `transaction_type`    | TEXT    | nullable — `purchase` \| `transfer` \| `income`               |
| `is_active`           | INTEGER | boolean, NOT NULL default true — inactive rules never match   |
| `confidence`          | REAL    | NOT NULL default 0.5, CHECK `0 ≤ confidence ≤ 1`              |
| `priority`            | INTEGER | NOT NULL default 0 — lower wins (`rule-manager-priority`)     |
| `times_applied`       | INTEGER | NOT NULL default 0 — count of _applications_, never of edits  |
| `created_at`          | TEXT    | `datetime('now')` default                                     |
| `last_used_at`        | TEXT    | nullable — stamped on reinforce/apply                         |

Indexes: `description_pattern`, `priority`, `confidence`, `times_applied`. A legacy `v_active_corrections` view (confidence ≥ 0.7, ordered by confidence/times_applied) exists for ad-hoc queries but is **not** used by runtime matching.

- [x] Table has all columns above with the confidence CHECK and the four indexes.
- [x] `transaction_type` rules can carry **no** entity (entity-free transfer/income classifiers).

## Normalization

A single canonical normalizer is applied identically on **write** (createOrUpdate, ChangeSet add, update) and on **read** (every match): uppercase → strip all digits → collapse runs of whitespace to one space → trim.

- [x] `"McDonald's North Sydney 2060"` → `"MCDONALD'S NORTH SYDNEY"`.
- [x] `"IKEA TEMPE"` and `"ikea tempe"` normalize to the same string.
- [x] Merchant suffix numbers, casing, and whitespace never cause an accidental miss; a stored pattern and the incoming description pass through the same function.

## Matching

- **exact** — normalized description equals the (upper-cased) pattern.
- **contains** — pattern (upper-cased) is a substring of the normalized description; empty pattern never matches.
- **regex** — pattern compiled case-insensitively against the normalized description; an invalid regex is silently treated as non-matching (one bad rule can't poison a batch).

Active matching (`findAllMatchingTransactionCorrectionsFromDb`, used by the import pipeline) filters to `is_active = true` and `confidence ≥ minConfidence` (default **0.7**), then orders by **`priority ASC, id ASC`** — the first survivor is the winner. This is deterministic and supersedes any confidence-based ordering.

A second matcher groups all matches by `[exact, contains, regex]` (each group sorted `confidence DESC, times_applied DESC`) for surfacing every applicable rule in the UI.

- [x] A "Woolworths" `contains` rule matches multiple Woolworths variants differing only by suffix numbers within one import.
- [x] When multiple rules match, the lowest `priority` (then lowest `id`) wins, deterministically.
- [x] Invalid regex rules are skipped, not thrown.

## Classification outcome

`findMatch` returns the winning rule plus a status: `matched` when `confidence ≥ 0.9`, else `uncertain`. In the import pipeline:

- [x] An **entity** match buckets as `matched` (confidence ≥ 0.9) or `uncertain` (below).
- [x] A **type-only** match (no `entity_id`, but a `transaction_type`, e.g. a PayID/"SAVINGS TRANSFER" transfer rule) is a **terminal `matched`** outcome with no entity, and counts toward `affectedCount` in import processing and re-evaluation.
- [x] A PayID transfer rule classifies later PayID rows as `transfer` without requiring an entity.

## REST API (`corrections.*`, finance pillar)

| Method & path                             | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `GET /corrections`                        | List, `minConfidence` / `matchType` filters, paginated                 |
| `GET /corrections/:id`                    | Fetch one (404 if absent)                                              |
| `POST /corrections`                       | createOrUpdate — upsert keyed on `(normalized pattern, matchType)`     |
| `PATCH /corrections/:id`                  | Patch fields (empty patch is a no-op re-read)                          |
| `DELETE /corrections/:id`                 | Delete (404 if absent)                                                 |
| `POST /corrections/find-match`            | Winning rule + `matched`/`uncertain` status for a description, or null |
| `POST /corrections/preview-matches`       | Transactions a candidate `(pattern, matchType)` rule would match       |
| `POST /corrections/:id/adjust-confidence` | Nudge confidence by delta; auto-deletes below 0.3                      |
| `POST /corrections/list-merged`           | List with caller-supplied pending (un-persisted) ChangeSets folded in  |
| `POST /corrections/preview-changeset`     | Before/after match diff of a ChangeSet vs caller-supplied transactions |
| `POST /corrections/apply-changeset`       | Apply a ChangeSet atomically; returns the full rule set                |

Body-carrying reads are POST because a GET cannot carry the body; static paths keep them clear of `/corrections/:id`. The AI cluster (`analyze`, `generate-rules`, `propose-changeset`, `revise-changeset`, `reject-changeset`) shares this router but is specified under `ai-rule-creation` / `correction-proposal-engine`.

- [x] `list` supports `minConfidence` + `matchType` filters and returns pagination meta.
- [x] `find-match` normalizes input, applies the active matcher, and returns the winning row with its status or `{ data: null }`.

## Upsert / reinforce semantics

`createOrUpdate` is keyed on `(normalized descriptionPattern, matchType)`:

- [x] **Hit** → `confidence += 0.1` (capped at 1.0), `times_applied += 1`, `last_used_at` stamped, `is_active` reset to true; `entityId` / `entityName` / `location` / `transactionType` / `priority` overlay the existing value only when the input is non-null; `tags` is **always overwritten** by `input.tags ?? []` (omit-to-keep does not apply — pass tags through explicitly).
- [x] **Miss** → insert with `confidence = 0.5`, `times_applied = 0`.
- [x] Create → createOrUpdate with the same pattern yields confidence 0.6, `times_applied` 1.
- [x] `times_applied` counts rule _applications_ (matches during processing / re-evaluation, and reinforcements), never ChangeSet edits.

## Confidence lifecycle & auto-cleanup

- [x] `adjustConfidence` clamps the result to `[0, 1]`.
- [x] When the adjusted confidence is `< 0.3` the row is deleted immediately (not deferred) — rules the user keeps rejecting decay and self-clean.
- [x] Create at 0.5, adjust by −0.3 → 0.2 → row deleted.
- [x] Matching activation threshold is `minConfidence` (default 0.7); the matched-vs-uncertain split is at 0.9.

## ChangeSet application

A ChangeSet is `{ source?, reason?, ops: Op[] }` with ops `add | edit | disable | remove`. Applied in a single DB transaction, ops run in fixed order (add → edit → disable → remove), and the full rule set is returned ordered `confidence DESC, times_applied DESC`.

- [x] Any op fails (e.g. edit/disable/remove targeting an unknown id → 404) → the entire ChangeSet rolls back; a partial set never lands.
- [x] `add` normalizes the pattern; `edit` cannot change `descriptionPattern`/`matchType`, only the overlay fields, confidence, and `is_active`.
- [x] `preview-changeset` is pure (caller supplies baseline rules + transactions): per-transaction before/after winning-match diff plus a summary (`newMatches`, `removedMatches`, `statusChanges`, `netMatchedDelta`), and matches exactly what apply-time would produce.

## Edge cases

| Case                     | Behaviour                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rule applies incorrectly | User edits the matched transaction → a ChangeSet proposal (`correction-proposal-engine`) suggests edit/disable/remove with preview |
| Two rules overlap        | `priority ASC, id ASC` decides the winner deterministically                                                                        |
| Entity deleted           | Rule survives as a type-only classifier or is proposed for cleanup                                                                 |
| Confidence floored       | A rule pushed below 0.3 is deleted on the spot                                                                                     |
| Malformed regex pattern  | Treated as non-matching; never throws                                                                                              |

## Out of scope (owned elsewhere)

- AI rule derivation / proposal / revision / rejection feedback — `ai-rule-creation`, `correction-proposal-engine`.
- Tag-rule learning (`transaction_tag_rules`) — `tag-rule-proposals`.
- Online-vs-in-person is a normal tag via `transaction_tag_rules`; there is no online/in-person field on transactions or corrections.
