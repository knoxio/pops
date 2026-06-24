/**
 * Wire types for the `substitutions.resolveForLine` REST procedure,
 * feeding the cook-modal picker. Kept in its own file so the service
 * module and its sibling loaders both import without a cyclic edge.
 */
export type SubResolveUnit = 'g' | 'ml' | 'count';
export type SubResolveLocation = 'pantry' | 'fridge' | 'freezer' | 'other';
export type SubResolveScope = 'global' | 'recipe';

export interface SubCandidateBatch {
  batchId: number;
  qtyRemaining: number;
  unit: SubResolveUnit;
  location: SubResolveLocation;
  expiresAt: string | null;
  prepStateId: number | null;
  prepStateLabel: string | null;
}

export interface SubCandidate {
  substitutionId: number;
  ratio: number;
  contextTags: readonly string[];
  scope: SubResolveScope;
  recipeId: number | null;
  substituteVariantId: number;
  substituteVariantName: string;
  substituteIngredientId: number;
  substituteIngredientName: string;
  notes: string | null;
  batches: readonly SubCandidateBatch[];
}

export interface SubResolution {
  lineIndex: number;
  lineVariantId: number;
  lineVariantName: string;
  linePrepStateId: number | null;
  linePrepStateLabel: string | null;
  lineQty: number;
  lineUnit: SubResolveUnit;
  recipeContextTags: readonly string[];
  candidates: readonly SubCandidate[];
}

export type ResolveForLineError = 'LineNotFound';

export type ResolveForLineResult =
  | { ok: true; resolution: SubResolution }
  | { ok: false; reason: ResolveForLineError };

export interface ResolveForLineArgs {
  recipeVersionId: number;
  lineIndex: number;
}
