# Correction Proposal Engine

Status: Partial — the proposal/edit/apply/reject lifecycle is fully built; a durable, queryable proposal **audit trail** is not (only the latest rejection per pattern is persisted). See [idea: correction-proposal-audit-trail](../../ideas/correction-proposal-audit-trail.md).

Turn a user's correction during import review into an explicit, reviewable bundle of rule changes (a **ChangeSet**) that the user edits, previews, and approves before any rule is written. Rules never change without approval; approval immediately reduces remaining manual work in the same import.

The correction-rule surface is finance-owned: rules live in the `transaction_corrections` table in the finance SQLite db, served under `/corrections` on the finance ts-rest contract.

## Data model

`transaction_corrections` — one learned classification rule:

- `id`, `descriptionPattern` (stored normalized: uppercased, digits stripped), `matchType` (`exact` | `contains` | `regex`)
- outcome fields, all optional: `entityId`, `entityName`, `location`, `tags` (JSON array), `transactionType` (`purchase` | `transfer` | `income`)
- `isActive`, `confidence` (0..1), `priority`, `timesApplied`, `createdAt`, `lastUsedAt`

A rule may classify **type only** (transfer/income with no entity) — those are valid and terminal (see business rules). Online-vs-in-person is never a rule outcome here; it is expressed as a normal tag via tag rules, not a correction field.

**ChangeSet** — a bundled list of ops approved/rejected as one unit:

```
{ source?, reason?, ops: [ Op, … ] }   // ops.length ≥ 1
Op = { op: 'add',     data: <rule fields incl. confidence/isActive> }
   | { op: 'edit',    id, data: <partial rule patch> }
   | { op: 'disable', id }
   | { op: 'remove',  id }
```

Even the simplest correction is modelled as a ChangeSet of one. Pending (un-persisted) ChangeSets live in the frontend import store and are folded into the baseline before previews and re-evaluation; all pending ChangeSets are committed atomically at import commit.

## REST API surface (under `/corrections`)

Deterministic CRUD + ChangeSet:

- `GET /corrections` — list rules (filters: `minConfidence`, `matchType`; paginated)
- `GET /corrections/:id`, `POST /corrections` (create-or-reinforce), `PATCH /corrections/:id`, `DELETE /corrections/:id`
- `POST /corrections/:id/adjust-confidence` — nudge confidence; row is deleted when it drops below 0.3
- `POST /corrections/find-match` — winning rule for a description (`matched` | `uncertain` | null)
- `POST /corrections/preview-matches` — transactions a candidate `(pattern, matchType)` would match
- `POST /corrections/list-merged` — rules with pending ChangeSets folded in (temp rows included), paginated
- `POST /corrections/preview-changeset` — before/after match impact of a ChangeSet against caller-supplied transactions (+ pending ChangeSets as baseline)
- `POST /corrections/apply-changeset` — apply a ChangeSet atomically; returns the full rule set

AI cluster (Anthropic via the finance env key; degrades when unavailable):

- `POST /corrections/analyze` — derive one validated rule (`matchType`/`pattern`/`confidence`) from a labelled transaction
- `POST /corrections/generate-rules` — batch-propose tagging rules from up to 50 transactions
- `POST /corrections/propose-changeset` — propose an add/edit ChangeSet for a correction signal, with DB-scanned impact preview; adapts to the latest prior rejection for that pattern
- `POST /corrections/revise-changeset` — AI-revise an in-progress ChangeSet from a free-text instruction (may add/edit/split/merge/remove any op)
- `POST /corrections/reject-changeset` — record rejection feedback for a ChangeSet (best-effort; steers the next proposal)

## Business rules

- **No silent learning** — no ChangeSet is written without explicit Apply. Reject applies nothing.
- **Bundled, atomic decision** — `apply-changeset` runs every op inside one `db.transaction` (order add → edit → disable → remove); an edit/disable/remove of an unknown id throws 404 and rolls the whole set back.
- **Deterministic preview** — impact is computed by the same matcher used in processing, over the merged rule set (DB rules + pending ChangeSets) as baseline. Editing any op marks its preview stale and blocks Apply until regenerated.
- **Scope control** — proposal/preview inputs are bounded: `generate-rules` ≤ 50 txns, preview ≤ 2000 txns, ≤ 200 pending ChangeSets, `maxPreviewItems` ≤ 500.
- **Pattern validity** — `analyze` requires the AI pattern to be a case-insensitive substring of the description (≥ 3 chars, uppercased); on mismatch it returns null and the caller falls back to a computed pattern. This is the fix for hallucinated patterns when the entity name is absent from the description (e.g. "MEMBERSHIP FEE" assigned to "American Express" keeps `MEMBERSHIP FEE` as the pattern).
- **Type-only learning is terminal** — a transfer/income rule with no entity classifies a matching row as a terminal `matched` result in import processing and re-evaluation, and counts toward the affected count. No entity is required.
- **Rejection is the escape hatch** — "this whole direction is wrong, start over", requiring a short feedback message. Day-to-day refinement uses the editor and AI helper, not reject-and-retry.

## Proposal dialog (frontend, import review)

Triggered by Save & Learn or editing a rule-matched transaction. A large modal with all regions visible:

- **Context panel** — the triggering transaction's raw description (prominent), amount, date, account, location, plus a "was → now" diff of the correction intent (entity / type / location); brand-new entity reads "assigned entity: <name>".
- **Operations list** — every op with kind badge, one-line summary, per-op impact count, staleness marker, and a delete control; an Add-operation control appends a new add, or an edit/disable/remove of an existing rule picked from a searchable list.
- **Detail editor** — edits `descriptionPattern`, `matchType`, target entity (existing or new), optional `location` / `transactionType` / `tags` for add/edit; rationale for disable/remove.
- **Impact panel** — live deterministic list for the selected op (will-change / already-match / unaffected), with a Combined-effect toggle for the whole ChangeSet net effect and a re-run control.
- **AI helper** — free-text transcript with full scope over the ChangeSet; submitting sends the triggering txns + current ChangeSet + instruction to `revise-changeset` and replaces the ChangeSet with the revised version. AI-revised ChangeSets are never auto-applied.
- **Actions** — Cancel (nothing persisted), Apply (atomic via `apply-changeset`, disabled while any preview is stale or the ChangeSet is empty), Reject with feedback.

A browse mode reuses the same dialog as a global rule manager.

## Approve flow

On Apply: the ChangeSet is added to the local pending store (no DB write yet), remaining import transactions are re-evaluated against the merged rule set (DB + all pending ChangeSets) using the same deterministic matcher, newly matched rows move to Matched, and the affected count is surfaced. All pending ChangeSets commit atomically at import commit.

## Edge cases

| Case                                           | Behaviour                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Proposal has zero impact in the current import | Allowed; the UI makes it clear.                                                                                  |
| Proposal is overly broad                       | Narrow in place via editor / AI helper; reject is reserved for start-over.                                       |
| Multiple existing rules match                  | ChangeSet may bundle `disable`/`edit` ops alongside `add`; Combined-effect shows the net outcome before Apply.   |
| User edits an AI suggestion then asks AI again | Revise receives the current user-edited ChangeSet + new instruction; AI may further add/edit/split/merge/remove. |
| AI unavailable                                 | The deterministic add/edit proposal, previews, and apply/reject all still work; AI helper degrades.              |

## Acceptance criteria

- [x] ChangeSet (add/edit/disable/remove) and the rule model (entity / type / location / tags) are defined and approved/rejected as one unit (`rest-corrections-schemas.ts`).
- [x] Impact preview is deterministic, computed by the processing matcher over the merged baseline, and returns counts + an inspectable affected list (`changeset-impact.ts`, `preview-impact.ts`, `preview-changeset`).
- [x] `propose-changeset` returns a bundled ChangeSet (N ≥ 1) with DB-scanned impact and adapts to the latest prior rejection for the pattern.
- [x] `revise-changeset` takes the current ChangeSet + free-text instruction and returns a revised ChangeSet that may add/edit/split/merge/remove any op (incl. user-added ops); never auto-applied.
- [x] `apply-changeset` applies atomically (all ops or none) and returns the full rule set; unknown-id ops 404 and roll back.
- [x] After Apply, remaining import transactions re-evaluate against DB + pending ChangeSets; newly matched rows move to Matched and the affected count is reported.
- [x] Reject requires a short feedback message, applies no changes, closes the dialog, and persists the feedback for the next proposal (best-effort).
- [x] `analyze` validates the returned pattern is a substring of the description (≥ 3 chars), returning null on mismatch so the caller falls back.
- [x] The dialog renders the triggering transaction (raw description, amount, date, account) and a "was → now" correction diff.
- [x] A transfer/income rule with no entity is accepted, classifies matching rows as terminal `matched`, and counts toward the affected count.
- [ ] A durable, queryable audit trail of all proposal attempts and outcomes (approved + rejected, append-only, per session) — NOT built; only the latest rejection per pattern is persisted. See [idea](../../ideas/correction-proposal-audit-trail.md).

## Verification

- "WOOLWORTHS 12837192" → "Woolworths" generalises to a pattern that matches other Woolworths variants in the same import after approval.
- A PayID transfer correction produces a transfer rule that classifies similar rows with no entity (terminal matched).
- A proposal bundling entity + location can be split (manually or via AI) into two ops, previewed independently, and applied as one ChangeSet without ever rejecting.
- A wrong rule match is fixed by adding a `disable` op against the existing rule alongside a new `add`, with Combined-effect confirming the net outcome before Apply.
