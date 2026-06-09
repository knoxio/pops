import { newIngredientCreation, newVariantCreation } from './resolve-create.js';
import { lookupPrepState, lookupRecipeYield, lookupSlug, lookupVariant } from './resolve-slug.js';

/**
 * Resolves the descriptor `ingredient[:variant[:prep]]` to entity ids,
 * detects recipe-as-ingredient refs, and emits auto-create instructions
 * for unknown ingredient/variant slugs. Prep states are curated — unknown
 * = error.
 */
import type { IngredientBlock, SourceSpan } from './ast.js';
import type { ResolverState } from './resolver-state.js';
import type { ResolvedIngredientBlock } from './resolver-types.js';

interface IngCtx {
  block: IngredientBlock;
  loc: SourceSpan;
  state: ResolverState;
  out: ResolvedIngredientBlock;
}

interface RecipeRefInfo {
  isRecipeRef: boolean;
}

export function resolveIngredient(
  block: IngredientBlock,
  state: ResolverState
): ResolvedIngredientBlock {
  const loc = block.loc ?? { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
  const out: ResolvedIngredientBlock = {
    kind: 'ingredient',
    index: block.index,
    ingredientId: null,
    variantId: null,
    prepStateId: null,
    qty: block.qty.qty,
    unit: block.qty.unit,
    optional: block.optional === true,
    notes: block.notes ?? null,
    isRecipeRef: false,
    recipeRef: null,
    loc,
  };
  const ctx: IngCtx = { block, loc, state, out };
  const refInfo = resolveHead(ctx);
  resolveVariant(ctx, refInfo);
  resolvePrep(ctx);
  return out;
}

function resolveHead(ctx: IngCtx): RecipeRefInfo {
  const { state, block, loc, out } = ctx;
  const slug = block.descriptor.ingredient;
  const reg = lookupSlug(state.ctx.db, slug);
  if (reg === null) {
    state.creations.push(newIngredientCreation(slug, block.qty.unit, loc));
    state.resolvedSlugs.set(slug, null);
    return { isRecipeRef: false };
  }
  if (reg.kind === 'prep_state') {
    state.errors.push({
      code: 'WrongKindForContext',
      message: `"@ingredient" head "${slug}" is a prep_state, not an ingredient`,
      loc,
      slug,
    });
    return { isRecipeRef: false };
  }
  if (reg.kind === 'recipe') {
    return handleRecipeRef(ctx, reg.targetId);
  }
  out.ingredientId = reg.targetId;
  state.resolvedSlugs.set(slug, reg.targetId);
  return { isRecipeRef: false };
}

function handleRecipeRef(ctx: IngCtx, recipeId: number): RecipeRefInfo {
  const { state, block, loc, out } = ctx;
  const slug = block.descriptor.ingredient;
  if (state.ctx.currentRecipeId !== undefined && state.ctx.currentRecipeId === recipeId) {
    state.errors.push({
      code: 'SelfReferenceRecipe',
      message: `@ingredient self-reference: recipe "${slug}" references itself`,
      loc,
      slug,
    });
    return { isRecipeRef: false };
  }
  const ry = lookupRecipeYield(state.ctx.db, recipeId);
  if (ry === null || ry.currentVersionId === null || ry.yieldIngredientId === null) {
    state.errors.push({
      code: 'WrongKindForContext',
      message: `@ingredient references recipe "${slug}" which has no promoted current version`,
      loc,
      slug,
    });
    return { isRecipeRef: false };
  }
  out.ingredientId = ry.yieldIngredientId;
  out.isRecipeRef = true;
  out.recipeRef = recipeId;
  return { isRecipeRef: true };
}

function resolveVariant(ctx: IngCtx, refInfo: RecipeRefInfo): void {
  const { block, loc, state, out } = ctx;
  const variantSlug = block.descriptor.variant;
  if (variantSlug === undefined) return;
  const ingredientSlug = block.descriptor.ingredient;
  if (refInfo.isRecipeRef) {
    state.errors.push({
      code: 'VariantOnRecipeRef',
      message: `variant "${variantSlug}" on recipe ref "${ingredientSlug}" — variants are meaningless on recipe references`,
      loc,
      slug: variantSlug,
    });
    return;
  }
  if (out.ingredientId === null) {
    state.creations.push(newVariantCreation(ingredientSlug, variantSlug, block.qty.unit, loc));
    return;
  }
  const v = lookupVariant(state.ctx.db, out.ingredientId, variantSlug);
  if (v === null) {
    state.creations.push(newVariantCreation(ingredientSlug, variantSlug, block.qty.unit, loc));
    return;
  }
  out.variantId = v.id;
}

function resolvePrep(ctx: IngCtx): void {
  const { block, loc, state, out } = ctx;
  const prepSlug = block.descriptor.prep;
  if (prepSlug === undefined) return;
  const reg = lookupSlug(state.ctx.db, prepSlug);
  if (reg === null) {
    state.errors.push({
      code: 'UnresolvedPrepStateSlug',
      message: `prep_state "${prepSlug}" is not in the curated set`,
      loc,
      slug: prepSlug,
    });
    state.proposedSlugs.push({ slug: prepSlug, fromLoc: loc, suggestedKind: 'prep_state' });
    return;
  }
  if (reg.kind !== 'prep_state') {
    state.errors.push({
      code: 'WrongKindForContext',
      message: `prep_state slot resolved to ${reg.kind} "${prepSlug}"`,
      loc,
      slug: prepSlug,
    });
    return;
  }
  const exists = lookupPrepState(state.ctx.db, reg.targetId);
  if (exists !== null) out.prepStateId = reg.targetId;
}
