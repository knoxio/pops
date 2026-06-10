# PRD-136: Approval & Rejection Flow

> Epic: [03 — Draft Review & Approval](../../epics/03-draft-review.md)

## Overview

Own the server-side contract for what happens when a user clicks Approve or Reject in the inbox. Three new tRPC mutations under a new `food.inbox.*` router (`approve`, `reject`, `unreject`), one new table (`recipe_version_rejections`) that stores the structured rejection reason, and the FK-consistent transitions across `recipe_versions.status`, `recipes.current_version_id`, and `ingest_sources` that each mutation runs in a single transaction.

This PRD owns the boundary between the inbox UI (PRDs 134/135/138) and the existing recipe domain. **The inbox calls into PRD-107's services (`promoteVersion`, `archiveVersion`) directly**, NOT through PRD-119's tRPC procedures, so the whole approve/reject lives inside a single transaction. The UI never calls `food.recipes.promote` directly for ingest-originated drafts — it always goes through `food.inbox.approve`, which composes PRD-107's `promoteVersion` with the inbox-specific side-effects (timestamping the source, capturing approval metadata). Likewise for reject vs PRD-107's `archiveVersion` plus a row in the new `recipe_version_rejections` table.

The schema-only piece (the rejections table) lands before PRDs 134/135/138 reference it; the mutations are consumed by PRDs 134 (list filters) and 135 (the approve/reject buttons).

## Why a new router namespace

PRD-119 already exposes `food.recipes.promote({ versionId })` and `food.recipes.archiveVersion({ versionId })`. The inbox could call those directly, but:

- An approve is a **draft-was-reviewed-and-accepted** event, distinct from a routine promote of a manually-edited draft. Storing that distinction (via `recipe_version_rejections` for rejects and a timestamp on `ingest_sources` for accepts) means the inbox can show "last reviewed 3 days ago" and a future audit can answer "how many ingest-originated drafts get rejected?".
- A reject must persist the structured reason; `archiveVersion` doesn't.
- Wrapping the existing mutations keeps PRD-119's surface unchanged: manual-edit promotes / discards keep working with no inbox-aware code path.

## Schema

### New table: `recipe_version_rejections`

```sql
CREATE TABLE recipe_version_rejections (
  version_id    INTEGER PRIMARY KEY REFERENCES recipe_versions(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL
                  CHECK (reason IN ('wrong-recipe','low-quality-extraction','duplicate','not-a-recipe','other')),
  note          TEXT,
  rejected_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`ON DELETE CASCADE` mirrors PRD-116's pattern for `recipe_version_proposed_slugs` — if PRD-107's `deleteRecipe` service ever wipes a recipe (rare), the rejection rows go with the versions.

PK is `version_id` (one rejection per version; un-rejecting deletes the row). Presence-of-row = "this archived version was rejected via the inbox" (distinguishes from PRD-119's "Discard a draft" which also archives but writes no rejections row).

`reason` enum is fixed at 5 values; v1 doesn't need more. `note` is free-text, optional.

### Reused (no schema delta)

- `recipe_versions.source_id` (PRD-107) — already FKs into `ingest_sources`. The inbox uses this to filter "ingest-originated versions".
- `recipe_versions.status` (PRD-107) — transitions `draft → current` on approve, `draft → archived` on reject, `archived → draft` on unreject (PRD-119 forbids `archived → current` directly; unreject must go via draft).
- `ingest_sources` (PRD-110) — PRD-136 writes `reviewed_at` on approve **only**. Reject does not stamp it (the source is still pending from the worker's POV; rejection is a decision about the resulting draft, not the source itself). See "ingest_sources extension" below.

### `ingest_sources` extension

Add one nullable column to PRD-110's table (additive; no constraint changes):

```sql
ALTER TABLE ingest_sources ADD COLUMN reviewed_at TEXT;
```

Set non-null exactly when `food.inbox.approve` completes successfully. Reject does NOT set it (a rejected draft can be un-rejected; only approval is terminal-and-observable from the source row). Used by PRD-134 to filter "approved sources out of the Drafts tab" without a JOIN through `recipes → current_version_id`.

This extension is small enough to live in PRD-136 rather than amending PRD-110 — it's an inbox-domain concept being recorded on the upstream provenance row.

## API

```ts
// apps/pops-api/src/modules/food/inbox-router.ts
export const inboxRouter = {
  approve: mutation({
    input: { versionId: number },
    output:
      | { ok: true; recipeSlug: string; promotedVersionNo: number }
      | { ok: false; reason: ApproveRejectError },
  }),

  reject: mutation({
    input: {
      versionId: number;
      reason: 'wrong-recipe' | 'low-quality-extraction' | 'duplicate' | 'not-a-recipe' | 'other';
      note?: string;        // optional free-text; trimmed; max 2000 chars
    },
    output: { ok: true } | { ok: false; reason: ApproveRejectError },
  }),

  unreject: mutation({
    input: { versionId: number },
    output:
      | { ok: true; restoredAs: 'draft' }
      | { ok: false; reason: ApproveRejectError },
  }),
};

export type ApproveRejectError =
  | 'NotIngestOriginated'           // version's source_id is NULL — inbox shouldn't touch it
  | 'VersionNotFound'
  | 'NotADraft'                     // approve/reject require status='draft'
  | 'NotArchived'                   // unreject requires status='archived'
  | 'NoRejectionRecord'             // unreject called on a version that was archived by PRD-119's discard
  | 'NotCompiled'                   // approve requires compile_status='compiled' (matches PRD-107's promote rule)
  | 'AlreadyReviewed'               // ingest_sources.reviewed_at is already set (approve called twice)
  | 'RecipeArchived'                // parent recipe was archived since the inspector loaded
  | 'ConcurrentPromotion'           // PRD-107's existing typed error — another tab promoted a different version of the same recipe between read and write
  | 'NoteRequired'                  // reject with reason='other' requires a non-empty note
  | 'NoteTooLong';
```

### Approve flow (server)

1. Open Drizzle transaction.
2. SELECT the version FOR UPDATE (SQLite has no row locks; transaction isolation is enough). Validate:
   - Row exists (`VersionNotFound`).
   - `source_id IS NOT NULL` (`NotIngestOriginated`).
   - `status = 'draft'` (`NotADraft`).
   - `compile_status = 'compiled'` (`NotCompiled`).
   - Parent recipe is not archived (`RecipeArchived`).
   - `ingest_sources.reviewed_at IS NULL` for the source (`AlreadyReviewed`).
3. Call PRD-107's `promoteVersion(versionId, db)` service (NOT the `food.recipes.promote` tRPC procedure — direct service call inside the same transaction). This archives any prior `current` version and flips the new one to `current` per PRD-107's transition rules.
   - PRD-107 already documents `ConcurrentPromotion` as the typed error returned when the partial-UNIQUE index rejects the second promote in a race. PRD-136 propagates that error to the inbox response. See "PRD-107 amendment" below for the small service-signature change required.
4. UPDATE `ingest_sources` SET `reviewed_at = datetime('now')` WHERE `id = <source_id>`.
5. Commit. Return the promoted version's `version_no` and the recipe slug.

### Reject flow (server)

1. Open Drizzle transaction.
2. Validate (same as approve except no `compile_status` requirement — a failed-compile draft can still be rejected, it just can't be approved).
3. INSERT into `recipe_version_rejections` (`version_id`, `reason`, `note`, default `rejected_at`). PK conflict ⇒ already rejected; surface `AlreadyReviewed` (covers re-reject).
4. Call PRD-107's `archiveVersion(versionId, db)` service to flip `status` to `archived`.
5. Commit. Return `{ ok: true }`.

### Unreject flow (server)

1. Open Drizzle transaction.
2. Validate:
   - Row exists.
   - `status = 'archived'` (`NotArchived`).
   - A row exists in `recipe_version_rejections` for this `version_id` (`NoRejectionRecord` — protects PRD-119's manually-discarded drafts from being accidentally restored via the inbox).
3. DELETE FROM `recipe_version_rejections` WHERE `version_id = ?`.
4. UPDATE `recipe_versions` SET `status = 'draft'` for that id.
5. Commit. Return `{ ok: true, restoredAs: 'draft' }`.

Unreject does NOT touch `ingest_sources.reviewed_at` — it was never set on the reject path, so nothing to undo.

## PRD-107 amendment

PRD-107 owns the recipe services (`packages/app-food/src/db/services/recipes.ts`) — `promoteVersion`, `archiveVersion`, etc. — and already documents `ConcurrentPromotion` as the typed error for racing promotes (PRD-107 AC line 183). This PRD requires two small, additive changes:

1. `promoteVersion(versionId, db)` and `archiveVersion(versionId, db)` accept a `db` argument that is the transactional client. PRD-116's compile already follows this pattern. The public `food.recipes.promote` / `food.recipes.archiveVersion` tRPC procedures (PRD-119) still wrap their own transaction when called directly; the inbox passes its own.
2. `promoteVersion` returns `{ ok: false, reason: 'ConcurrentPromotion' }` (structured result) instead of throwing when the partial-UNIQUE index rejects. PRD-107's existing AC keeps the throwing behaviour for direct callers if they prefer try/catch; the structured-result variant is offered alongside (or replaces it — implementation choice). The new error code itself is already named in PRD-107.

PRD-119's tRPC surface is unchanged. The amendment lives entirely in PRD-107's services file.

## Business Rules

- The inbox mutations operate ONLY on versions where `source_id IS NOT NULL`. Calling them on a manually-authored version returns `NotIngestOriginated`.
- Approving a draft promotes it to `current` exactly the way PRD-119's promote does. No special promotion path; the only difference is the `ingest_sources.reviewed_at` write and the absence of a rejection row.
- A rejection writes a row to `recipe_version_rejections` **before** the status flip. If the status flip fails, the rejection row rolls back (single transaction).
- Un-reject re-opens an archived-and-rejected version as a `draft`. The user can re-edit it via the inspector (PRD-135), and approve it the second time around. Each (re-)reject creates a fresh rejections row only because the previous one was deleted by the prior unreject.
- An ingest source whose `reviewed_at` is non-null is "done" from the inbox's POV — its draft was approved. The Drafts tab filter is `source.reviewed_at IS NULL AND draft_version.status = 'draft'`.
- PRD-119's `food.recipes.promote` is still callable for manually-authored drafts. The inbox doesn't shadow that path; it adds a parallel one.
- Reject reason `other` requires `note` to be non-empty (server validates; UI enforces). The other four reasons accept an optional note.

## Edge Cases

| Case                                                                                                                                       | Behaviour                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User clicks Approve on a draft, then someone else's tab approves a different draft of the same recipe before the first transaction commits | `promoteVersion` detects that the prior-current changed; returns `ConcurrentPromotion`. Inbox UI reloads the source and shows the new state.                                                                                |
| User clicks Approve twice in quick succession (double-click on the button)                                                                 | First call sets `reviewed_at`. Second call hits `AlreadyReviewed`. UI debounces but server defends.                                                                                                                         |
| User clicks Reject with `reason='other'` and an empty note                                                                                 | Server validates; returns `NoteRequired`. UI also requires the note (disabled Reject button) so the server defense rarely fires.                                                                                            |
| User rejects a draft that PRD-119 already discarded                                                                                        | Inbox validation sees `status='archived'`, returns `NotADraft` — the inbox refuses to record a rejection against an already-archived version. The Drafts tab wouldn't show such a row anyway; race only arises across tabs. |
| User un-rejects a version whose recipe has since been archived                                                                             | Unreject transaction succeeds — version status returns to `draft`. UI surfaces a banner on next load: "Parent recipe is archived; un-archive recipe first to publish."                                                      |
| User un-rejects a version that was discarded via PRD-119 (no rejections row)                                                               | Returns `NoRejectionRecord`. UI hides the Unreject button for these (filter at query time on the rejections-row JOIN).                                                                                                      |
| Approve called against a failed-compile draft                                                                                              | Returns `NotCompiled`. Matches PRD-119's promote rule.                                                                                                                                                                      |
| Approve called against a draft whose source row was deleted                                                                                | FK on `recipe_versions.source_id` is `REFERENCES ingest_sources(id)` — no ON DELETE specified means RESTRICT (SQLite default). Source can't be deleted while a version FKs to it. Edge can't arise in v1.                   |
| Reject `note` exceeds 2000 chars                                                                                                           | Returns `NoteTooLong`. UI enforces with `maxlength`; server defends.                                                                                                                                                        |
| User approves a draft, then immediately un-rejects another archived version of the same recipe                                             | First approve sets `current_version_id` to the approved version. Unreject flips the archived version back to draft. Now the recipe has one current + one draft. Normal state.                                               |
| ingest_sources row's `reviewed_at` is set but the draft itself was discarded via PRD-119 afterwards                                        | Source shows as "reviewed" from the inbox; recipe has no current version. PRD-134's query filter handles this: `reviewed_at IS NULL OR recipes.current_version_id IS NOT NULL`.                                             |
| Approve transaction rolls back mid-way (e.g. DB write error after `promoteVersion` succeeded but before `reviewed_at` UPDATE)              | SQLite transaction rollback restores both. Source stays unreviewed; version stays `draft`. User retries.                                                                                                                    |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `recipe_version_rejections` table with the columns + CHECK + PK above.
- [x] Migration adds `ingest_sources.reviewed_at TEXT NULL` column.
- [x] Migration is owned by the `food` module per PRD-101's manifest pattern.

### Mutations

- [x] `food.inbox.approve` lives at `apps/pops-api/src/modules/food/inbox/router.ts` and is mounted under the `food` module's tRPC root. (Sub-folder layout chosen to match `recipes/`, `conversions/`, `hero-image/` precedent.)
- [x] All three mutations validate the preconditions above and return the documented error shape (no thrown errors for expected business-rule violations).
- [x] Each mutation runs in a single Drizzle transaction.
- [x] Approve calls PRD-107's `promoteVersion` service (transactional db variant); inbox response surfaces `ConcurrentPromotion` when the underlying promote returns `{ ok: false }`.

### PRD-107 amendment

- [x] `promoteVersion(db, versionId)` and `archiveVersion(db, versionId)` accept a transactional db argument (better-sqlite3 nested transactions use SAVEPOINT, so passing a tx wraps as a sub-tx).
- [x] `promoteVersion` returns `{ ok: false, reason: 'ConcurrentPromotion' }` (structured result) instead of throwing when the partial-UNIQUE index rejects.
- [x] PRD-119's tRPC procedures (`food.recipes.promote`, `food.recipes.archiveVersion`) wrap their own transaction; inbox callers pass their own.

### Tests

- [x] Vitest integration tests at `apps/pops-api/src/modules/food/__tests__/inbox-router.test.ts`:
  - Approve happy path (compiled draft → current; `reviewed_at` set; rejection row absent).
  - Approve denies `NotIngestOriginated`, `NotADraft`, `NotCompiled`, `AlreadyReviewed`, `RecipeArchived`, `VersionNotFound`.
  - Approve race: documented as structurally untestable in single-threaded better-sqlite3 (the partial-UNIQUE only fires across genuinely concurrent transactions); inbox's `{ ok: false } → 'ConcurrentPromotion'` propagation is typecheck-verified and the race semantics themselves are covered by PRD-107's invariant test (`partial UNIQUE prevents a manual UPDATE from creating two currents`). The integration test exercises the archive-then-promote pair sequentially instead.
  - Reject happy path with each of the five reason values; rejections row written.
  - Reject `other` without note → `NoteRequired`.
  - Reject `note` > 2000 chars → `NoteTooLong`.
  - Unreject happy path: archived + rejected → draft; rejections row deleted.
  - Unreject denies `NoRejectionRecord` for PRD-119-discarded drafts.
  - Approve → unreject covered by `NotArchived` guard.
- [x] PRD-107's existing test suite still passes after the service-signature change (`recipe-model.test.ts` updated for the discriminated-result shape; 301/301 green).
- [ ] Migration round-trip test — drizzle-kit doesn't ship a `down` migration runner; the migration is forward-only consistent with every other food-domain migration. Deferred AC, matches PRD-110/116/123/125 precedent.

## Out of Scope

- The UI surfaces that consume these mutations — **PRD-134** (queue page filters by `reviewed_at`), **PRD-135** (inspector buttons), **PRD-138** (Rejected tab).
- Bulk approve / bulk reject mutations — explicit no-go per Epic 03's Key Decisions.
- Per-rejection comments / threads — single `note` field, no further discussion model.
- Notifying anyone (push, email, Slack) on approve or reject — theme decision (no notifications in v1).
- A "soft un-approve" that demotes a current version back to draft — out of scope. To revert, use PRD-119's "Restore as new draft" from a historic version page.
- Recording who rejected what (user_id) — single-user POPS.
- Analytics over rejection reasons — captured for future querying; no v1 dashboard.
- Editing a rejection's reason or note after the fact — out of scope; un-reject + re-reject is the path.
- Auto-rejecting drafts that have failed compile after N attempts — explicit user action only in v1.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions` schema (especially `status` enum and `source_id` FK).
- **PRD-110** — `ingest_sources` table (extended here with `reviewed_at`).
- **PRD-107** — `promoteVersion` and `archiveVersion` services (this PRD owns the service file); amendment described above adds a `db` argument and a structured-result variant for `promoteVersion`.
- **PRD-119** — `food.recipes.promote` / `food.recipes.archiveVersion` tRPC procedures (manually-authored draft path; unchanged by this PRD).
- **PRD-125** — `IngestStatus` / `PartialReason` shapes for downstream tab filters (no contract on this PRD, but the inbox routers read source rows that PRD-125 writes).
- **PRD-116** — `compile_status` semantics; approve gates on `compiled`.
