/**
 * Cross-PRD type contracts for batch lifecycle (PRD-145) + FIFO
 * consumption UI (PRD-146).
 *
 * Owned jointly by PRD-145 (CRUD + lifecycle types) and PRD-146
 * (`BatchForConsumeRow`, `LineResolution`). The tRPC `food.batches.*`
 * router and the cook-modal components consume this file.
 *
 * Note: PRD-145 also ships the `batches.deleted_at` SQL migration —
 * that's NOT in scope for the prep PR that originally landed this
 * file. The `deletedAt` column on `BatchDetail` reflects the post-145
 * schema; reads will return `null` until 145's ALTER TABLE merges.
 */

export type BatchLocation = 'pantry' | 'fridge' | 'freezer' | 'other';
export type BatchUnit = 'g' | 'ml' | 'count';
export type BatchSourceType = 'purchase' | 'recipe_run' | 'gift' | 'other';
export type ManualBatchSourceType = 'purchase' | 'gift' | 'other';

export interface BatchDetail {
  id: number;
  variantId: number;
  variantName: string;
  variantSlug: string;
  ingredientId: number;
  ingredientName: string;
  ingredientSlug: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: BatchUnit;
  sourceType: BatchSourceType;
  sourceId: number | null;
  sourceRecipeRunId: number | null;
  sourceRecipeSlug: string | null;
  location: BatchLocation;
  producedAt: string;
  expiresAt: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface YieldArgs {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: BatchUnit;
  location: BatchLocation;
  expiresAt?: string;
  notes?: string;
}

export interface ManualBatchInput {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: BatchUnit;
  location: BatchLocation;
  sourceType: ManualBatchSourceType;
  producedAt?: string;
  expiresAt?: string;
  notes?: string;
}

export interface BatchEditPatch {
  expiresAt?: string | null;
  notes?: string | null;
  prepStateId?: number | null;
}

export type BatchAdjustReason = 'spoiled' | 'wasted' | 'correction';

export type BatchError =
  | 'BatchNotFound'
  | 'BatchDeleted'
  | 'NegativeQty'
  | 'CannotEditFromRun'
  | 'BadExpiry'
  | 'BadAdjustment';

export type BatchMutationResult = { ok: true } | { ok: false; reason: BatchError };

export type BatchAdjustResult = { ok: true; newQty: number } | { ok: false; reason: BatchError };

/**
 * PRD-146 — search result row for the `BatchOverridePicker` widget.
 * Returned by `food.batches.searchForConsume`. FIFO-ordered server-side
 * by `expires_at ASC NULLS LAST, produced_at ASC`.
 */
export interface BatchForConsumeRow {
  id: number;
  variantId: number;
  variantName: string;
  variantSlug: string;
  ingredientId: number;
  ingredientName: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: BatchUnit;
  location: BatchLocation;
  expiresAt: string | null;
  producedAt: string;
}

/**
 * PRD-146 — line-keyed consume need surfaced to the cook modal.
 *
 * Adds display fields and `lineIndex` (`recipe_lines.position`, 1-based)
 * to PRD-108's variant/prep/qty `ConsumptionNeed` so the UI can render a
 * per-line picker and the resolution map can be keyed by lineIndex.
 * Quantities are already at the user's current scale factor.
 *
 * Produced by PRD-144's `prepareCook` query alongside any
 * pre-flight `LineShortfall[]`. PRD-146's UI does not derive aggregation
 * itself — the server is the source of truth for per-line need shapes.
 */
export interface LineConsumeNeed {
  lineIndex: number;
  ingredientId: number;
  ingredientName: string;
  variantId: number;
  variantName: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qty: number;
  canonicalUnit: BatchUnit;
  optional: boolean;
}

/**
 * PRD-146 — line-keyed shortfall surfaced to `ShortfallList`.
 *
 * `available` reflects what FIFO would cover if applied. `available=0`
 * means no matching non-empty, non-deleted batch exists for the line's
 * `(variantId, prepStateId)` pair.
 */
export interface LineShortfall {
  lineIndex: number;
  ingredientId: number;
  ingredientName: string;
  variantName: string;
  prepStateLabel: string | null;
  needed: number;
  available: number;
  unit: BatchUnit;
}

/**
 * PRD-146 — per-line resolution state held by `useCookResolution`.
 *
 * `fifo` = accept PRD-108's default; `batch-override` = user picked a
 * specific batch; `external` = user marks the line as consumed
 * outside the batch system; `partial` = some FIFO + some external.
 */
export type LineResolution =
  | { kind: 'fifo' }
  | {
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      /**
       * PRD-149 — set when the override came from the Substitutions section
       * of `BatchOverridePicker`. Carried through to `food.cook.markCooked`
       * so the server can validate the edge + append an audit note.
       */
      substitutionEdgeId?: number;
    }
  | { kind: 'external'; reasonNote?: string }
  | {
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      /** PRD-149 — see `batch-override` variant. */
      substitutionEdgeId?: number;
    };
