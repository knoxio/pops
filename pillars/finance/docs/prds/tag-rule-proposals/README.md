# Tag Rule Proposals

Status: Shipped — the deterministic propose/preview/apply/reject contract, the
import-wizard UI, and the **seed taxonomy (v1)** that primes a fresh database all
ship.

A tag-learning system that proposes reusable **tag rules** from a user's tag edits
during import. Rules contribute tag _suggestions_ with source attribution; they
never overwrite user-entered tags and never infer entity/type. Kept separate from
classification corrections so tagging can improve without risking incorrect entity
assignment. Online-vs-in-person is just a normal tag here (a rule over
`transaction_tag_rules`), not a transaction field.

## Data model

`transaction_tag_rules` (finance DB):

- `id`, `descriptionPattern`, `matchType` (`exact | contains | regex`, default `exact`)
- `entityId` (nullable — null = global, set = scoped to one entity group)
- `tags` (JSON `string[]`), `isActive` (default true)
- `confidence` (0..1, default 0.5), `priority` (default 0)
- `timesApplied`, `createdAt`, `lastUsedAt`

`tag_vocabulary`: `tag` (PK), `source` (`seed | user`), `isActive`, `createdAt`.
Primed on a fresh DB with the v1 taxonomy as `source: 'seed'` rows (idempotent
`INSERT OR IGNORE`); `source: 'user'` rows are added by accepted-new-tag upserts
on top.

A **ChangeSet** is `{ source?, reason?, ops[] }`; ops are a discriminated union on
`op`: `add { data }`, `edit { id, data }`, `disable { id }`, `remove { id }`. Apply
runs all ops in one DB transaction (atomic — no partial ChangeSet lands).

## REST API surface (`/tag-rules/*`)

- `GET  /tag-rules/vocabulary` → `{ tags: string[] }` (active vocabulary).
- `POST /tag-rules/propose` — body `{ signal, transactions[], maxPreviewItems }`;
  returns `{ changeSet, rationale, preview }`. Deterministic (no AI): builds a
  single `add` op from a tag-edit signal (`descriptionPattern`, `matchType`,
  `entityId?`, `tags`) and previews it.
- `POST /tag-rules/preview` — body `{ changeSet, transactions[], maxPreviewItems }`;
  returns `{ counts, affected[] }` with per-transaction before/after suggested tags.
- `POST /tag-rules/apply` — body `{ changeSet, acceptedNewTags[] }`; upserts accepted
  tags into the vocabulary (`source: 'user'`), applies the ChangeSet, returns the
  full rule list. An op on an unknown id → 404.
- `POST /tag-rules/reject` — body `{ changeSet, feedback (required), signal?, transactions? }`;
  applies no changes; if a `signal` is supplied, returns a revised `followUpProposal`
  whose rationale/reason incorporate the feedback, else `null`.

`maxPreviewItems` is coerced, 1..500, default 200.

## Business rules

- Rules contribute **suggestions only** — a transaction with any `userTags` in the
  current import is skipped by the preview and never overwritten.
- Suggestions carry source attribution (`source: 'tag_rule'`, `pattern`) and an
  `isNew` flag set when the tag is absent from the vocabulary (case-insensitive).
- Matching is entity-scoped or global: a rule with `entityId` applies only to that
  entity; a null-entity rule applies everywhere. Pattern matching is
  exact / contains (case-insensitive on normalized description) / regex
  (case-insensitive, invalid patterns skipped with a warning).
- Preview is fully deterministic: reads only the supplied transactions plus the
  vocabulary; `counts` = `{ affected, suggestionChanges, newTagProposals }`.
- Rules drive tagging only — never entity/type inference.

## Import-wizard integration

- **Tag Review** offers "Save tag rule…" at two scopes, both opening
  `TagRuleProposalDialog`:
  - **Group scope** — pattern = entity name, `entityId` = the group's entity, tags
    = the union of the group's tags; accept/reject applies to the whole group.
  - **Transaction scope** — pattern = the row's description, `entityId` = the row's
    entity, tags = that row's tags; accept/reject applies to just that row.
    All confirmed transactions are passed as the preview scope.
- The dialog presents brand-new tags as checkboxes; accepting passes them as
  `acceptedNewTags` so they enter the vocabulary going forward. Rejecting requires
  a non-empty feedback message and shows any `followUpProposal` in-place.
- Approving applies the ChangeSet, stores it in the import store (committed with the
  final import), and live-updates suggested tags for the remaining non-user-edited
  transactions in the session — without touching entity/type.
- **Rule-creation step**: detects tag patterns from the import batch by grouping on
  entity (fallback: description prefix) and keeping tags occurring in ≥50% of a
  group's transactions (`Math.ceil(n * 0.5)`); proposes them as `contains` rules the
  user can select and save in one click before committing.
- Committed rules apply on every future import via `findMatchingTagRules` (active
  rules only, entity-scoped or global, exact/contains/regex), feeding the
  tag-suggester alongside correction-rule and AI tags.

## Acceptance criteria

- [x] Tag rule model matches by exact/contains/regex and proposes one or more tags
      as suggestions, never forced edits.
- [x] Bundled ChangeSet supports add / edit / disable / remove and applies atomically.
- [x] `POST /tag-rules/propose` and `/preview` return a deterministic impact preview
      scoped to caller-supplied transactions; user-tagged transactions are excluded.
- [x] Suggestions carry source attribution and an `isNew` flag against the vocabulary.
- [x] `POST /tag-rules/apply` upserts `acceptedNewTags` into the vocabulary and an
      accepted New tag is part of the vocabulary thereafter; unknown-id ops 404.
- [x] `POST /tag-rules/reject` requires feedback, applies nothing, and returns a
      feedback-revised `followUpProposal` when a signal is supplied.
- [x] Tag Review supports group-scope and transaction-scope proposals via
      `TagRuleProposalDialog`; approving live-updates remaining suggestions without
      altering entity/type.
- [x] Rule-creation step groups by entity, applies a ≥50% occurrence threshold, and
      one-click-saves selected `contains` rules before commit.
- [x] Committed rules apply to all future imports with entity-scoped and global
      exact/contains/regex matching via `findMatchingTagRules`.
- [x] Seed taxonomy (v1) primes a fresh database with `source: 'seed'` vocabulary so
      suggestions read against a populated vocabulary before any user tags exist; seeded
      via an idempotent `INSERT OR IGNORE` in the finance migration baseline.
