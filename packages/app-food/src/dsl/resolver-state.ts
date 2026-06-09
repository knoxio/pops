/**
 * Resolver accumulator state — PRD-115.
 *
 * Errors, proposed slugs, creations, and resolved blocks are gathered
 * across the whole AST walk. Per-block helpers push into the same
 * accumulator; the top-level `resolveRecipeAst` decides ok/!ok based on
 * `errors.length`.
 */
import type { IngredientBlock } from './ast';
import type {
  ProposedSlug,
  ResolveContext,
  ResolveError,
  ResolvedBlock,
  ResolvedIngredientBlock,
  ResolverCreation,
} from './resolver-types';

export interface ResolverState {
  ctx: ResolveContext;
  errors: ResolveError[];
  creations: ResolverCreation[];
  proposedSlugs: ProposedSlug[];
  blocks: ResolvedBlock[];
  /** Maps `@N` index → resolved ingredient block for step-body lookup. */
  ingredientIndex: Map<number, ResolvedIngredientBlock>;
  /** Maps ingredient slug → resolved id (for step `@slug` refs). Auto-created entries map to null until PRD-116 runs. */
  resolvedSlugs: Map<string, number | null>;
  /** Pending source AST ingredient blocks indexed by `index` (for `@N` lookup fallback). */
  sourceIngredients: Map<number, IngredientBlock>;
}

export function newResolverState(
  ctx: ResolveContext,
  sourceIngredients: Map<number, IngredientBlock>
): ResolverState {
  return {
    ctx,
    errors: [],
    creations: [],
    proposedSlugs: [],
    blocks: [],
    ingredientIndex: new Map(),
    resolvedSlugs: new Map(),
    sourceIngredients,
  };
}
