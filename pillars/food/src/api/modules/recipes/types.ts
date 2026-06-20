/**
 * Wire output shapes for `food.recipes.*` — PRD-119.
 *
 * Lightweight shapes for list / drafts / proposed slugs live here;
 * the heavy `RecipeVersionWithCompiledData` returned by `getForRendering`
 * is owned by `@pops/app-food-db` (PRD-121) and consumed verbatim.
 */
import { z } from 'zod';

import type { SourceSpan } from '../../../dsl/ast.js';
import type { CompileResult } from '../../../dsl/compile-types.js';

export const RECIPE_TYPE_VALUES = [
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
] as const;

export const RecipeTypeSchema = z.enum(RECIPE_TYPE_VALUES);
export type RecipeType = z.infer<typeof RecipeTypeSchema>;

export const SortOrderSchema = z.enum(['createdAtDesc', 'titleAsc', 'recentlyCooked']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export interface RecipeListItem {
  id: number;
  slug: string;
  title: string | null;
  recipeType: RecipeType;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
  tags: string[];
  hasCurrentVersion: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface RecipeDraftSummary {
  versionId: number;
  versionNo: number;
  title: string;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
  createdAt: string;
  preview: string;
}

export interface ProposedSlugRow {
  slug: string;
  suggestedKind: 'ingredient' | 'recipe' | 'prep_state' | null;
  fromLoc: SourceSpan;
  createdAt: string;
}

export type PromoteResult = { ok: true; versionId: number } | { ok: false; reason: PromoteReason };
export type PromoteReason =
  | 'ConcurrentPromotion'
  | 'CannotPromoteUncompiledVersion'
  | 'VersionNotFound';

export interface CreateRecipeResult {
  slug: string;
  recipeId: number;
  versionId: number;
  compile: CompileResult;
}

export interface SaveDraftResult {
  compile: CompileResult;
}

export interface CreateNewDraftResult {
  versionId: number;
  versionNo: number;
}

export interface RestoreVersionResult {
  newVersionId: number;
  newVersionNo: number;
}
