/**
 * PRD-136 — inbox-side approve/reject/unreject for ingest-originated drafts.
 *
 * Each mutation runs in a single Drizzle transaction (the SAVEPOINT inside
 * `promoteVersion` nests under it) so partial state can never escape: the
 * `ingest_sources.reviewed_at` write and the `recipe_versions.status` flip
 * commit or roll back together with the rejection-row insert.
 *
 * The inbox calls PRD-107's `promoteVersion` / `archiveVersion` services
 * directly — NOT PRD-119's tRPC procedures — so each mutation is one tx.
 * Errors are surfaced as `{ ok: false, reason: ApproveRejectError }` so the
 * pops-api router boundary doesn't translate typed exceptions.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';

import { ingestSources, recipes, recipeVersionRejections, recipeVersions } from '../schema.js';
import { type FoodDb } from './internal.js';
import { promoteVersion, archiveVersion } from './recipe-versions.js';

export type ApproveRejectError =
  | 'NotIngestOriginated'
  | 'VersionNotFound'
  | 'NotADraft'
  | 'NotArchived'
  | 'NoRejectionRecord'
  | 'NotCompiled'
  | 'AlreadyReviewed'
  | 'RecipeArchived'
  | 'ConcurrentPromotion'
  | 'NoteRequired'
  | 'NoteTooLong';

export type RejectionReason =
  | 'wrong-recipe'
  | 'low-quality-extraction'
  | 'duplicate'
  | 'not-a-recipe'
  | 'other';

export interface ApproveSuccess {
  ok: true;
  recipeSlug: string;
  promotedVersionNo: number;
}

export interface RejectSuccess {
  ok: true;
}

export interface UnrejectSuccess {
  ok: true;
  restoredAs: 'draft';
}

export interface ApproveRejectFailure {
  ok: false;
  reason: ApproveRejectError;
}

export type ApproveResult = ApproveSuccess | ApproveRejectFailure;
export type RejectResult = RejectSuccess | ApproveRejectFailure;
export type UnrejectResult = UnrejectSuccess | ApproveRejectFailure;

export interface RejectInput {
  versionId: number;
  reason: RejectionReason;
  note?: string | null;
}

export const NOTE_MAX_CHARS = 2000;

interface VersionForReview {
  readonly versionId: number;
  readonly versionNo: number;
  readonly recipeId: number;
  readonly recipeSlug: string;
  readonly recipeArchivedAt: string | null;
  readonly status: 'draft' | 'current' | 'archived';
  readonly compileStatus: 'uncompiled' | 'compiled' | 'failed';
  readonly sourceId: number | null;
  readonly sourceReviewedAt: string | null;
}

function loadVersionForReview(db: FoodDb, versionId: number): VersionForReview | null {
  const rows = db
    .select({
      versionId: recipeVersions.id,
      versionNo: recipeVersions.versionNo,
      recipeId: recipeVersions.recipeId,
      recipeSlug: recipes.slug,
      recipeArchivedAt: recipes.archivedAt,
      status: recipeVersions.status,
      compileStatus: recipeVersions.compileStatus,
      sourceId: recipeVersions.sourceId,
      sourceReviewedAt: ingestSources.reviewedAt,
    })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .leftJoin(ingestSources, eq(ingestSources.id, recipeVersions.sourceId))
    .where(eq(recipeVersions.id, versionId))
    .all();
  return rows[0] ?? null;
}

function fail(reason: ApproveRejectError): ApproveRejectFailure {
  return { ok: false, reason };
}

function validateRejectionInput({
  reason,
  note,
}: Pick<RejectInput, 'reason' | 'note'>): ApproveRejectFailure | null {
  const trimmed = (note ?? '').trim();
  if (reason === 'other' && trimmed.length === 0) return fail('NoteRequired');
  if (trimmed.length > NOTE_MAX_CHARS) return fail('NoteTooLong');
  return null;
}

export function approveDraft(db: FoodDb, versionId: number): ApproveResult {
  return db.transaction((tx): ApproveResult => {
    const row = loadVersionForReview(tx, versionId);
    if (row === null) return fail('VersionNotFound');
    if (row.sourceId === null) return fail('NotIngestOriginated');
    if (row.recipeArchivedAt !== null) return fail('RecipeArchived');
    if (row.status !== 'draft') return fail('NotADraft');
    if (row.compileStatus !== 'compiled') return fail('NotCompiled');
    if (row.sourceReviewedAt !== null) return fail('AlreadyReviewed');
    const promoted = promoteVersion(tx, versionId);
    if (!promoted.ok) return fail('ConcurrentPromotion');
    tx.update(ingestSources)
      .set({ reviewedAt: sql`(datetime('now'))` })
      .where(eq(ingestSources.id, row.sourceId))
      .run();
    return {
      ok: true,
      recipeSlug: row.recipeSlug,
      promotedVersionNo: promoted.row.versionNo,
    };
  });
}

export function rejectDraft(db: FoodDb, input: RejectInput): RejectResult {
  const noteError = validateRejectionInput(input);
  if (noteError !== null) return noteError;
  return db.transaction((tx): RejectResult => {
    const row = loadVersionForReview(tx, input.versionId);
    if (row === null) return fail('VersionNotFound');
    if (row.sourceId === null) return fail('NotIngestOriginated');
    if (row.recipeArchivedAt !== null) return fail('RecipeArchived');
    if (row.status !== 'draft') return fail('NotADraft');
    // Race-safe check-and-insert: `onConflictDoNothing` makes the INSERT
    // itself the source of truth instead of a separate SELECT, so two
    // concurrent rejects can't both pass and one throw on the PK. The
    // returning clause tells us whether we wrote anything; zero rows means
    // a sibling rejection already exists.
    const trimmedNote = (input.note ?? '').trim();
    const inserted = tx
      .insert(recipeVersionRejections)
      .values({
        versionId: input.versionId,
        reason: input.reason,
        note: trimmedNote.length === 0 ? null : trimmedNote,
      })
      .onConflictDoNothing()
      .returning()
      .all();
    if (inserted[0] === undefined) return fail('AlreadyReviewed');
    archiveVersion(tx, input.versionId);
    return { ok: true };
  });
}

export function unrejectDraft(db: FoodDb, versionId: number): UnrejectResult {
  return db.transaction((tx): UnrejectResult => {
    const versionRow = tx
      .select({ status: recipeVersions.status })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, versionId))
      .all()[0];
    if (versionRow === undefined) return fail('VersionNotFound');
    if (versionRow.status !== 'archived') return fail('NotArchived');
    const rejection = tx
      .select({ versionId: recipeVersionRejections.versionId })
      .from(recipeVersionRejections)
      .where(eq(recipeVersionRejections.versionId, versionId))
      .all()[0];
    if (rejection === undefined) return fail('NoRejectionRecord');
    tx.delete(recipeVersionRejections)
      .where(eq(recipeVersionRejections.versionId, versionId))
      .run();
    tx.update(recipeVersions)
      .set({ status: 'draft' })
      .where(eq(recipeVersions.id, versionId))
      .run();
    return { ok: true, restoredAs: 'draft' };
  });
}

/**
 * Read-side query for PRD-134's Drafts-tab filter: count of ingest sources
 * whose draft has not been reviewed yet. Exported so the inbox UI can use the
 * same predicate the spec calls out ("source.reviewed_at IS NULL AND draft
 * version status = 'draft'"). Kept on the service so the rule stays a single
 * source of truth.
 */
export function countPendingInboxSources(db: FoodDb): number {
  const rows = db
    .select({ id: ingestSources.id })
    .from(ingestSources)
    .innerJoin(recipeVersions, eq(recipeVersions.sourceId, ingestSources.id))
    .where(and(isNull(ingestSources.reviewedAt), eq(recipeVersions.status, 'draft')))
    .all();
  return rows.length;
}
