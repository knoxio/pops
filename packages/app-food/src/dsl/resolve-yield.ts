import { newIngredientCreation, newVariantCreation } from './resolve-create.js';
import { lookupPrepState, lookupRecipeYield, lookupSlug, lookupVariant } from './resolve-slug.js';

/**
 * Resolves the yield ingredient (or recipe → recipe's own yield), the
 * optional variant scoped under that ingredient, and the optional
 * prep_state (curated; no auto-create).
 */
import type { SourceSpan, YieldDecl } from './ast.js';
import type { ResolverState } from './resolver-state.js';
import type { ResolvedYield } from './resolver-types.js';

interface YieldCtx {
  decl: YieldDecl;
  loc: SourceSpan;
  state: ResolverState;
  out: ResolvedYield;
}

export function resolveYield(decl: YieldDecl, state: ResolverState): ResolvedYield {
  const loc = decl.loc ?? { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
  const out: ResolvedYield = {
    yieldIngredientId: null,
    yieldVariantId: null,
    yieldPrepStateId: null,
    yieldQty: decl.qty.qty,
    yieldUnit: decl.qty.unit,
  };
  const ctx: YieldCtx = { decl, loc, state, out };
  const desc = decl.descriptor;
  if (desc.ingredient === 'none' && decl.qty.qty === 0 && decl.qty.unit === 'none') {
    return out;
  }
  const ingredientId = resolveYieldHead(ctx);
  resolveYieldVariant(ctx, ingredientId);
  resolveYieldPrep(ctx);
  return out;
}

function resolveYieldHead(ctx: YieldCtx): number | null {
  const { state, decl, loc, out } = ctx;
  const slug = decl.descriptor.ingredient;
  const reg = lookupSlug(state.ctx.db, slug);
  if (reg === null) {
    state.creations.push(newIngredientCreation(slug, decl.qty.unit, loc));
    state.resolvedSlugs.set(slug, null);
    return null;
  }
  if (reg.kind === 'ingredient') {
    out.yieldIngredientId = reg.targetId;
    state.resolvedSlugs.set(slug, reg.targetId);
    return reg.targetId;
  }
  if (reg.kind === 'recipe') {
    return resolveYieldFromRecipe(ctx, reg.targetId);
  }
  // prep_state in the yield head slot is a kind-mismatch, not an unresolved
  // ingredient — UnresolvedYieldIngredient is reserved for genuine failures.
  state.errors.push({
    code: 'WrongKindForContext',
    message: `@yield slug "${slug}" resolves to a ${reg.kind}; expected an ingredient or recipe`,
    loc,
    slug,
  });
  return null;
}

function resolveYieldFromRecipe(ctx: YieldCtx, recipeId: number): number | null {
  const { state, loc, out, decl } = ctx;
  const ry = lookupRecipeYield(state.ctx.db, recipeId);
  if (ry === null || ry.yieldIngredientId === null) {
    state.errors.push({
      code: 'YieldCannotBeRecipe',
      message: `@yield references recipe "${decl.descriptor.ingredient}" which has no current yield`,
      loc,
      slug: decl.descriptor.ingredient,
    });
    return null;
  }
  out.yieldIngredientId = ry.yieldIngredientId;
  out.yieldVariantId = ry.yieldVariantId;
  out.yieldPrepStateId = ry.yieldPrepStateId;
  return ry.yieldIngredientId;
}

function resolveYieldVariant(ctx: YieldCtx, ingredientId: number | null): void {
  const { decl, loc, state, out } = ctx;
  const variantSlug = decl.descriptor.variant;
  if (variantSlug === undefined) return;
  const ingredientSlug = decl.descriptor.ingredient;
  if (ingredientId === null) {
    state.creations.push(newVariantCreation(ingredientSlug, variantSlug, decl.qty.unit, loc));
    return;
  }
  const v = lookupVariant(state.ctx.db, ingredientId, variantSlug);
  if (v === null) {
    state.creations.push(newVariantCreation(ingredientSlug, variantSlug, decl.qty.unit, loc));
    return;
  }
  out.yieldVariantId = v.id;
}

function resolveYieldPrep(ctx: YieldCtx): void {
  const { decl, loc, state, out } = ctx;
  const prepSlug = decl.descriptor.prep;
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
  if (exists !== null) out.yieldPrepStateId = reg.targetId;
}
