import { resolveIngredient } from './resolve-ingredient.js';
import { resolveStep } from './resolve-step.js';
import { resolveYield } from './resolve-yield.js';
import { newResolverState } from './resolver-state.js';

/**
 * Resolves every slug reference in the parser AST to a real entity id via
 * `slug_registry`. Pure: read-only DB access, deterministic for a given
 * `(ast, registry snapshot)` pair, no side effects.
 *
 * Output: `ResolvedRecipeAst`, `creations` (auto-create instructions for
 * unknown ingredient/variant slugs — processed downstream by compile),
 * and `proposedSlugs` (review-queue pointers for unresolvable LLM-ingested
 * refs).
 */
import type { IngredientBlock, RecipeAst } from './ast.js';
import type { ResolveContext, ResolveResult } from './resolver-types.js';

export function resolveRecipeAst(ast: RecipeAst, ctx: ResolveContext): ResolveResult {
  const sourceIngredients = collectIngredients(ast);
  const state = newResolverState(ctx, sourceIngredients);
  const yieldResolved = resolveYield(ast.yield, state);
  // Resolve ingredient blocks first so step body `@N` lookups land against
  // the resolved entries.
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') {
      const resolved = resolveIngredient(block, state);
      state.blocks.push(resolved);
      state.ingredientIndex.set(resolved.index, resolved);
    }
  }
  for (const block of ast.blocks) {
    if (block.kind === 'step') {
      state.blocks.push(resolveStep(block, state));
    } else if (block.kind === 'markdown') {
      state.blocks.push({
        kind: 'markdown',
        text: block.text,
        loc: block.loc ?? { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
      });
    }
  }
  // Re-order to match the input order so the downstream compiler doesn't
  // have to.
  const orderedBlocks = reorderBlocks(ast, state.blocks);
  const resolved = {
    header: ast.recipe,
    yield: yieldResolved,
    blocks: orderedBlocks,
  };
  if (state.errors.length > 0) {
    return {
      ok: false,
      resolved,
      errors: state.errors,
      creations: state.creations,
      proposedSlugs: state.proposedSlugs,
    };
  }
  return {
    ok: true,
    resolved,
    creations: state.creations,
    proposedSlugs: state.proposedSlugs,
  };
}

function collectIngredients(ast: RecipeAst): Map<number, IngredientBlock> {
  const out = new Map<number, IngredientBlock>();
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') out.set(block.index, block);
  }
  return out;
}

function reorderBlocks(
  ast: RecipeAst,
  resolvedBlocks: ReturnType<typeof newResolverState>['blocks']
): ReturnType<typeof newResolverState>['blocks'] {
  const byKindAndKey = new Map<string, (typeof resolvedBlocks)[number]>();
  let stepIdx = 0;
  let mdIdx = 0;
  for (const b of resolvedBlocks) {
    if (b.kind === 'ingredient') byKindAndKey.set(`i:${b.index}`, b);
    else if (b.kind === 'step') {
      byKindAndKey.set(`s:${stepIdx}`, b);
      stepIdx += 1;
    } else {
      byKindAndKey.set(`m:${mdIdx}`, b);
      mdIdx += 1;
    }
  }
  const ordered: typeof resolvedBlocks = [];
  let sCounter = 0;
  let mCounter = 0;
  for (const block of ast.blocks) {
    let key: string;
    if (block.kind === 'ingredient') {
      key = `i:${block.index}`;
    } else if (block.kind === 'step') {
      key = `s:${sCounter}`;
      sCounter += 1;
    } else {
      key = `m:${mCounter}`;
      mCounter += 1;
    }
    const found = byKindAndKey.get(key);
    if (found !== undefined) ordered.push(found);
  }
  return ordered;
}

export type {
  ProposedSlug,
  ResolveContext,
  ResolveError,
  ResolveErrorCode,
  ResolveResult,
  ResolvedBlock,
  ResolvedIngredientBlock,
  ResolvedMarkdownBlock,
  ResolvedRecipeAst,
  ResolvedStepBlock,
  ResolvedStepBody,
  ResolvedStepBodyPart,
  ResolvedYield,
  ResolverCreation,
} from './resolver-types.js';
