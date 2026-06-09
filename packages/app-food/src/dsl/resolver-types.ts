import type { FoodDb } from '@pops/app-food-db';

import type { QtyUnit, RecipeHeader, SourceSpan } from './ast';

export interface ResolveContext {
  /** Drizzle handle; used only for read-only lookups. */
  db: FoodDb;
  /**
   * If set, references to this recipe's own slug raise
   * `SelfReferenceRecipe` rather than resolving as a recipe ref. UX
   * optimisation — a self-reference is an author error, not a graph cycle.
   */
  currentRecipeId?: number;
}

export type ResolveResult =
  | {
      ok: true;
      resolved: ResolvedRecipeAst;
      creations: readonly ResolverCreation[];
      proposedSlugs: readonly ProposedSlug[];
    }
  | {
      ok: false;
      /**
       * Partial AST — known slugs / indexes are filled in; unresolved or
       * wrong-kind references carry `null` ids. Callers can still render
       * the structure while flagging the per-line errors.
       */
      resolved: ResolvedRecipeAst;
      errors: readonly ResolveError[];
      creations: readonly ResolverCreation[];
      proposedSlugs: readonly ProposedSlug[];
    };

export interface ResolvedRecipeAst {
  header: RecipeHeader;
  yield: ResolvedYield;
  blocks: readonly ResolvedBlock[];
}

export interface ResolvedYield {
  /** Null while the yield slug is auto-created — compile fills it in. */
  yieldIngredientId: number | null;
  yieldVariantId: number | null;
  yieldPrepStateId: number | null;
  yieldQty: number;
  yieldUnit: string;
}

export type ResolvedBlock = ResolvedIngredientBlock | ResolvedStepBlock | ResolvedMarkdownBlock;

export interface ResolvedIngredientBlock {
  kind: 'ingredient';
  index: number;
  /** Null while auto-created — compile fills it in. */
  ingredientId: number | null;
  variantId: number | null;
  prepStateId: number | null;
  qty: number;
  unit: string;
  optional: boolean;
  notes: string | null;
  isRecipeRef: boolean;
  recipeRef: number | null;
  loc: SourceSpan;
}

export interface ResolvedStepBlock {
  kind: 'step';
  bodyResolved: ResolvedStepBody;
  duration: QtyUnit | null;
  temperature: QtyUnit | null;
  loc: SourceSpan;
}

export interface ResolvedMarkdownBlock {
  kind: 'markdown';
  text: string;
  loc: SourceSpan;
}

export type ResolvedStepBody = ResolvedStepBodyPart[];
export type ResolvedStepBodyPart =
  | { kind: 'text'; value: string }
  | {
      kind: 'ref';
      ingredientIndex: number | null;
      ingredientId: number | null;
      variantId: number | null;
      prepStateId: number | null;
    }
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };

export type CreationKind = 'ingredient' | 'variant';

export type ResolverCreation =
  | {
      kind: 'ingredient';
      slug: string;
      defaultUnit: 'g' | 'ml' | 'count';
      fromLoc: SourceSpan;
    }
  | {
      kind: 'variant';
      parentIngredientSlug: string;
      slug: string;
      defaultUnit: 'g' | 'ml' | 'count';
      fromLoc: SourceSpan;
    };

export interface ProposedSlug {
  slug: string;
  fromLoc: SourceSpan;
  suggestedKind?: 'ingredient' | 'recipe' | 'prep_state';
}

export type ResolveErrorCode =
  | 'UnresolvedPrepStateSlug'
  | 'UnresolvedYieldIngredient'
  | 'YieldCannotBeRecipe'
  | 'UnresolvedStepRefIndex'
  | 'UnresolvedStepRefSlug'
  | 'WrongKindForContext'
  | 'SelfReferenceRecipe'
  | 'VariantOnRecipeRef'
  | 'AmbiguousSlug';

export interface ResolveError {
  code: ResolveErrorCode;
  message: string;
  loc: SourceSpan;
  slug?: string;
}
