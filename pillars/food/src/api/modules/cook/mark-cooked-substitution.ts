/**
 * Substitution-edge validation for the cook override path. Given a
 * `substitutionEdgeId` on a `batch-override` / `partial` override,
 * validates that:
 *
 *   1. The edge exists in `substitutions`.
 *   2. The chosen batch's variant matches the edge's `to` side
 *      (either `to_variant_id` directly, or `to_ingredient_id` when the
 *      sub is ingredient-level).
 *
 * On success returns the relaxed expectations the draw step should use
 * (variant pinned to the sub batch, prep mismatch tolerated) plus the
 * audit line to append to `recipe_runs.notes`.
 */
import { eq } from 'drizzle-orm';

import {
  batches,
  type FoodDb,
  ingredients,
  ingredientVariants,
  substitutions,
} from '../../../db/index.js';

export interface LineDescriptor {
  position: number;
  variantId: number | null;
  prepStateId: number | null;
  optional: boolean;
  needQty: number;
  canonicalUnit: 'g' | 'ml' | 'count';
}

export interface SubstitutionContextArgs {
  tx: FoodDb;
  edgeId: number | undefined;
  batchId: number;
  line: LineDescriptor;
}

export type SubstitutionContext =
  | {
      ok: true;
      expectedVariantId: number | null;
      expectedPrepStateId: number | null;
      auditNote: string | null;
    }
  | { ok: false };

export function resolveSubstitutionContext(args: SubstitutionContextArgs): SubstitutionContext {
  if (args.edgeId === undefined) {
    return {
      ok: true,
      expectedVariantId: args.line.variantId,
      expectedPrepStateId: args.line.prepStateId,
      auditNote: null,
    };
  }
  const edgeRow = loadEdge(args.tx, args.edgeId);
  if (edgeRow === null) return { ok: false };
  const batchRow = loadBatchIdentity(args.tx, args.batchId);
  if (batchRow === null) return { ok: false };
  if (!edgeMatchesBatch(edgeRow, batchRow)) return { ok: false };
  return {
    ok: true,
    expectedVariantId: batchRow.variantId,
    expectedPrepStateId: null,
    auditNote: formatSubstitutionNote({
      slot: { lineIndex: args.line.position, edgeId: edgeRow.id, ratio: edgeRow.ratio },
      target: {
        batchId: args.batchId,
        ingredientName: batchRow.ingredientName,
        variantName: batchRow.variantName,
      },
    }),
  };
}

interface EdgeRow {
  id: number;
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  ratio: number;
}

function loadEdge(tx: FoodDb, edgeId: number): EdgeRow | null {
  const row = tx
    .select({
      id: substitutions.id,
      fromIngredientId: substitutions.fromIngredientId,
      fromVariantId: substitutions.fromVariantId,
      toIngredientId: substitutions.toIngredientId,
      toVariantId: substitutions.toVariantId,
      ratio: substitutions.ratio,
    })
    .from(substitutions)
    .where(eq(substitutions.id, edgeId))
    .all()[0];
  return row ?? null;
}

interface BatchIdentity {
  variantId: number;
  ingredientId: number;
  ingredientName: string;
  variantName: string;
}

function loadBatchIdentity(tx: FoodDb, batchId: number): BatchIdentity | null {
  const row = tx
    .select({
      variantId: batches.variantId,
      ingredientId: ingredientVariants.ingredientId,
      ingredientName: ingredients.name,
      variantName: ingredientVariants.name,
    })
    .from(batches)
    .innerJoin(ingredientVariants, eq(ingredientVariants.id, batches.variantId))
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .where(eq(batches.id, batchId))
    .all()[0];
  return row ?? null;
}

function edgeMatchesBatch(edge: EdgeRow, batch: BatchIdentity): boolean {
  if (edge.toVariantId !== null) return edge.toVariantId === batch.variantId;
  if (edge.toIngredientId !== null) return edge.toIngredientId === batch.ingredientId;
  return false;
}

interface SubstitutionNoteArgs {
  readonly slot: {
    readonly lineIndex: number;
    readonly edgeId: number;
    readonly ratio: number;
  };
  readonly target: {
    readonly batchId: number;
    readonly ingredientName: string;
    readonly variantName: string;
  };
}

function formatSubstitutionNote(args: SubstitutionNoteArgs): string {
  const { slot, target } = args;
  const ratioStr = Number.isInteger(slot.ratio) ? slot.ratio.toFixed(1) : String(slot.ratio);
  return `cook-override:substitution line=${slot.lineIndex} edge=${slot.edgeId} ratio=${ratioStr} batch=${target.batchId} sub=${target.ingredientName}/${target.variantName}`;
}
