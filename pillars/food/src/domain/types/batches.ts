/**
 * Type contracts for batch lifecycle and the FIFO consumption UI, shared
 * between the contract/router and the cook-modal components.
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
 * Search result row for the `BatchOverridePicker` widget. FIFO-ordered
 * server-side by `expires_at ASC NULLS LAST, produced_at ASC`.
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
 * Line-keyed consume need surfaced to the cook modal. `lineIndex` is
 * `recipe_lines.position` (1-based), keying the per-line picker and the
 * resolution map. Quantities are already at the user's current scale
 * factor; the server owns the per-line need shapes.
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
 * Line-keyed shortfall surfaced to `ShortfallList`. `available` reflects
 * what FIFO would cover if applied; `available=0` means no matching
 * non-empty, non-deleted batch exists for the line's
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
 * Per-line resolution state held by `useCookResolution`.
 *
 * `fifo` = accept the default FIFO consumption; `batch-override` = user
 * picked a specific batch; `external` = user marks the line as consumed
 * outside the batch system; `partial` = some FIFO + some external.
 */
export type LineResolution =
  | { kind: 'fifo' }
  | {
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      /**
       * Set when the override came from the Substitutions section of
       * `BatchOverridePicker`. Carried through to the mark-cooked mutation
       * so the server can validate the edge and append an audit note.
       */
      substitutionEdgeId?: number;
    }
  | { kind: 'external'; reasonNote?: string }
  | {
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      /** See the `batch-override` variant. */
      substitutionEdgeId?: number;
    };
