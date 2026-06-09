import { lookupRecipeYield, lookupSlug } from './resolve-slug.js';

/**
 * Walks step body parts and resolves inline `@N` (index) and `@slug`
 * references. Step refs do NOT auto-create — missing refs raise
 * `UnresolvedStepRefIndex` or `UnresolvedStepRefSlug`.
 */
import type { SourceSpan, StepBlock, StepBodyPart } from './ast.js';
import type { ResolverState } from './resolver-state.js';
import type { ResolvedStepBlock, ResolvedStepBodyPart } from './resolver-types.js';

export function resolveStep(block: StepBlock, state: ResolverState): ResolvedStepBlock {
  const loc = block.loc ?? { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
  return {
    kind: 'step',
    bodyResolved: block.body.map((part) => resolvePart(part, state, loc)),
    duration: block.duration ?? null,
    temperature: block.temperature ?? null,
    loc,
  };
}

function resolvePart(
  part: StepBodyPart,
  state: ResolverState,
  loc: SourceSpan
): ResolvedStepBodyPart {
  switch (part.kind) {
    case 'text':
      return { kind: 'text', value: part.value };
    case 'time':
      return { kind: 'time', qty: part.qty };
    case 'temperature':
      return { kind: 'temperature', qty: part.qty };
    case 'ref':
      return typeof part.ref === 'number'
        ? resolveIndexRef(part.ref, state, loc)
        : resolveSlugRef(part.ref, state, loc);
  }
}

function emptyRef(): ResolvedStepBodyPart {
  return {
    kind: 'ref',
    ingredientIndex: null,
    ingredientId: null,
    variantId: null,
    prepStateId: null,
  };
}

function resolveIndexRef(
  index: number,
  state: ResolverState,
  loc: SourceSpan
): ResolvedStepBodyPart {
  const ing = state.ingredientIndex.get(index);
  if (ing === undefined) {
    state.errors.push({
      code: 'UnresolvedStepRefIndex',
      message: `@${index} in step body has no matching @ingredient(${index}, ...)`,
      loc,
    });
    return {
      kind: 'ref',
      ingredientIndex: index,
      ingredientId: null,
      variantId: null,
      prepStateId: null,
    };
  }
  return {
    kind: 'ref',
    ingredientIndex: index,
    ingredientId: ing.ingredientId,
    variantId: ing.variantId,
    prepStateId: ing.prepStateId,
  };
}

function resolveSlugRef(slug: string, state: ResolverState, loc: SourceSpan): ResolvedStepBodyPart {
  const fromBlock = matchAgainstIngredientBlocks(slug, state);
  if (fromBlock !== null) return fromBlock;
  const cached = state.resolvedSlugs.get(slug);
  if (cached !== undefined) {
    return {
      kind: 'ref',
      ingredientIndex: null,
      ingredientId: cached,
      variantId: null,
      prepStateId: null,
    };
  }
  return lookupSlugForStepRef(slug, state, loc);
}

function matchAgainstIngredientBlocks(
  slug: string,
  state: ResolverState
): ResolvedStepBodyPart | null {
  const expectedId = state.resolvedSlugs.get(slug);
  if (expectedId === undefined || expectedId === null) return null;
  for (const ing of state.ingredientIndex.values()) {
    if (ing.ingredientId === expectedId) {
      return {
        kind: 'ref',
        ingredientIndex: ing.index,
        ingredientId: ing.ingredientId,
        variantId: ing.variantId,
        prepStateId: ing.prepStateId,
      };
    }
  }
  return null;
}

function lookupSlugForStepRef(
  slug: string,
  state: ResolverState,
  loc: SourceSpan
): ResolvedStepBodyPart {
  const reg = lookupSlug(state.ctx.db, slug);
  if (reg === null) {
    state.errors.push({
      code: 'UnresolvedStepRefSlug',
      message: `@${slug} in step body does not resolve to a known ingredient or recipe`,
      loc,
      slug,
    });
    state.proposedSlugs.push({ slug, fromLoc: loc, suggestedKind: 'ingredient' });
    return emptyRef();
  }
  if (reg.kind === 'prep_state') {
    // Step body refs treat any non-ingredient/recipe target as unresolved;
    // surface as UnresolvedStepRefSlug + proposedSlugs hint for consistency.
    state.errors.push({
      code: 'UnresolvedStepRefSlug',
      message: `@${slug} in step body resolves to a prep_state; expected an ingredient or recipe`,
      loc,
      slug,
    });
    state.proposedSlugs.push({ slug, fromLoc: loc, suggestedKind: 'ingredient' });
    return emptyRef();
  }
  if (reg.kind === 'recipe') {
    if (state.ctx.currentRecipeId !== undefined && state.ctx.currentRecipeId === reg.targetId) {
      state.errors.push({
        code: 'SelfReferenceRecipe',
        message: `@${slug} in step body is a self-reference to the current recipe`,
        loc,
        slug,
      });
      return emptyRef();
    }
    const ry = lookupRecipeYield(state.ctx.db, reg.targetId);
    return {
      kind: 'ref',
      ingredientIndex: null,
      ingredientId: ry?.yieldIngredientId ?? null,
      variantId: null,
      prepStateId: null,
    };
  }
  return {
    kind: 'ref',
    ingredientIndex: null,
    ingredientId: reg.targetId,
    variantId: null,
    prepStateId: null,
  };
}
