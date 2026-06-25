# Approve / Reject Flow

> Status: Done — schema, services, REST contract, handlers, and inbox UI dialogs all shipped.

Server-side decision boundary for the ingest inbox: when the reviewer clicks Approve or Reject on an ingest-originated draft, three REST endpoints (`approve`, `reject`, `unreject`) run the FK-consistent transitions across `recipe_versions.status`, `recipes.current_version_id`, and `ingest_sources` — each in a single transaction. A dedicated `recipe_version_rejections` table stores the structured rejection reason so a rejected draft is distinguishable from a plain discarded draft and can be restored.

The inbox composes the recipe-version lifecycle services (`promoteVersion`, `archiveVersion`) directly inside one transaction rather than calling the recipe REST endpoints — so the promotion/archival and the inbox-specific side-effects (stamping the source, writing the rejection row) commit or roll back atomically. Approve is a _draft-was-reviewed-and-accepted_ event, distinct from a routine promote of a manually-edited draft; reject persists a reason that a routine archive would not.

## Data model

### `recipe_version_rejections` (one row per rejected version)

| column        | type    | notes                                                                                               |
| ------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `version_id`  | INTEGER | PK, `REFERENCES recipe_versions(id) ON DELETE CASCADE`                                              |
| `reason`      | TEXT    | NOT NULL, CHECK in (`wrong-recipe`, `low-quality-extraction`, `duplicate`, `not-a-recipe`, `other`) |
| `note`        | TEXT    | nullable free-text                                                                                  |
| `rejected_at` | TEXT    | NOT NULL, default `datetime('now')`                                                                 |

PK on `version_id` enforces one rejection per version; un-rejecting deletes the row. **Presence of a row** is the signal "this archived version was rejected via the inbox" — distinct from a manually-discarded draft, which also archives but writes no rejection row. `ON DELETE CASCADE` mirrors the proposed-slugs pattern so wiping a recipe cascades through its versions' review metadata.

### `ingest_sources.reviewed_at` (nullable TEXT)

Set exactly when `approve` succeeds. NULL while the source is pending or rejected — reject is non-terminal (the draft can be un-rejected), so only approval is terminal-and-observable from the source row. The Drafts-tab query filters out approved sources via this column without a JOIN through `recipes.current_version_id`.

### Reused (no schema delta here)

- `recipe_versions.source_id` — FK into `ingest_sources`; NULL means manually-authored (the inbox refuses to touch it). `status` transitions `draft → current` (approve), `draft → archived` (reject), `archived → draft` (unreject). `compile_status` gates approve.
- `recipes.current_version_id` / `recipes.archived_at` — promotion repoints the current version; an archived parent recipe blocks approve and reject.
- Partial UNIQUE `uq_recipe_versions_one_current` on `(recipe_id) WHERE status='current'` — the index that surfaces concurrent-promotion races.

## REST API

All under the food pillar contract.

| Method | Path              | Body / query                   | 200 response                                                             |
| ------ | ----------------- | ------------------------------ | ------------------------------------------------------------------------ |
| POST   | `/inbox/approve`  | `{ versionId }`                | `{ ok: true, recipeSlug, promotedVersionNo }` \| `{ ok: false, reason }` |
| POST   | `/inbox/reject`   | `{ versionId, reason, note? }` | `{ ok: true }` \| `{ ok: false, reason }`                                |
| POST   | `/inbox/unreject` | `{ versionId }`                | `{ ok: true, restoredAs: 'draft' }` \| `{ ok: false, reason }`           |

Expected business-rule violations are returned as `{ ok: false, reason }` on HTTP 200 — never thrown across the wire. The `reason` enum:

`NotIngestOriginated` · `VersionNotFound` · `NotADraft` · `NotArchived` · `NoRejectionRecord` · `NotCompiled` · `AlreadyReviewed` · `RecipeArchived` · `ConcurrentPromotion` · `NoteRequired` · `NoteTooLong`

(The read endpoints `/inbox/list`, `/inbox/rejected`, `/inbox/failed`, `/inbox/review`, `/inbox/pending-count` belong to the queue/inspector/tabs PRDs and are not specified here.)

## Business rules

- **Ingest-only.** Mutations operate only on versions with `source_id IS NOT NULL`; a manually-authored version returns `NotIngestOriginated`.
- **Single transaction.** Each mutation opens one transaction. The nested `promoteVersion` runs in a SAVEPOINT under it, so the `reviewed_at` write, the status flip, and the rejection-row insert all commit or roll back together.
- **Approve = promote + stamp.** Validates the version exists, is ingest-originated, parent recipe not archived, `status='draft'`, `compile_status='compiled'`, and `ingest_sources.reviewed_at IS NULL`; calls `promoteVersion` (archives any prior current, flips this one to current, repoints `recipes.current_version_id`); sets `reviewed_at = datetime('now')`. Returns the recipe slug and promoted version number.
- **Reject = record + archive.** Validates exists / ingest-originated / parent not archived / `status='draft'` (no compile gate — a failed-compile draft can still be rejected). Inserts the rejection row **before** the status flip, then archives the version. `reject` does **not** stamp `reviewed_at` (the decision is about the draft, not the source). `reason='other'` requires a non-empty `note`; the other four reasons accept an optional note; `note` is trimmed and capped at 2000 chars.
- **Unreject = restore.** Validates `status='archived'` and that a rejection row exists (`NoRejectionRecord` protects manually-discarded drafts from being restored via the inbox). Deletes the rejection row and flips `status` back to `draft`. Does not touch `reviewed_at` (it was never set on reject). The restored draft can be re-edited and re-approved.
- **Concurrent promotion is atomic.** When two transactions race to promote different versions of the same recipe, the partial UNIQUE rejects the second; the internal sentinel rolls the whole transaction back (so the recipe is never left with no current version) and `approve` surfaces `ConcurrentPromotion`.
- **Re-reject** creates a fresh rejection row only because the prior `unreject` deleted the previous one.

## Edge cases

- Approve twice (double-click): first sets `reviewed_at`; second hits `AlreadyReviewed`. The reject path's race-safe `INSERT … ON CONFLICT DO NOTHING … RETURNING` makes the insert the source of truth — a concurrent re-reject that writes nothing surfaces `AlreadyReviewed`.
- Reject a draft another tab already archived/discarded: `status` is no longer `draft` → `NotADraft`.
- Unreject a draft discarded outside the inbox (no rejection row): `NoRejectionRecord`.
- Unreject when the parent recipe was archived since load: succeeds (status → draft); the UI surfaces an "un-archive recipe first to publish" banner.
- Approve a failed-compile draft: `NotCompiled`.
- A source's media files evicted (FIFO) does not delete the source row; `reviewed_at` and the rejection metadata are unaffected.

## Acceptance criteria

### Schema

- [x] `recipe_version_rejections` table exists with `version_id` PK (`ON DELETE CASCADE`), `reason` CHECK over the 5-value enum, nullable `note`, and `rejected_at` default `datetime('now')`.
- [x] `ingest_sources.reviewed_at TEXT NULL` exists; set only on successful approve.

### Mutations

- [x] `POST /inbox/approve`, `/inbox/reject`, `/inbox/unreject` are modelled in the food REST contract with the discriminated `{ ok, ... }` response unions and the 11-value `reason` enum.
- [x] All three validate the documented preconditions and return `{ ok: false, reason }` on 200 — no thrown errors for business-rule violations.
- [x] Each mutation runs in a single transaction; `promoteVersion` nests via SAVEPOINT.
- [x] Approve calls `promoteVersion` (transactional handle) and surfaces `ConcurrentPromotion` when it returns `{ ok: false }`; also sets `reviewed_at`.
- [x] Reject validates note rules (`NoteRequired` for `other` with empty note, `NoteTooLong` over 2000 chars), writes the rejection row before archiving, and uses race-safe insert-or-conflict (`AlreadyReviewed`).
- [x] Unreject requires `status='archived'` (`NotArchived`) and an existing rejection row (`NoRejectionRecord`), then deletes the row and restores `draft`.

### Recipe-version services

- [x] `promoteVersion(db, versionId)` and `archiveVersion(db, versionId)` accept a transactional db handle so inbox callers compose them inside their own transaction.
- [x] `promoteVersion` returns the discriminated `{ ok: false, reason: 'ConcurrentPromotion', recipeId }` on partial-UNIQUE conflict (via an internal sentinel that forces rollback), instead of leaking the constraint error; `CannotPromoteUncompiledVersion` still throws for un-pre-validated callers.

### Tests

- [x] Integration tests assert the wire envelopes and the not-found / `NoteRequired` paths for approve and reject.
- [x] Service-level lifecycle (promote archives prior current, partial-UNIQUE invariant) is covered in the recipe-model tests.

## Consumed by

The inbox UI (queue page, draft inspector with Approve/Reject dialogs and Decision pane, Rejected tab) consumes these endpoints. Bulk approve/reject, per-rejection threads, notifications, soft un-approve, capturing who rejected, and a rejection-reason analytics dashboard are all out of scope here.
