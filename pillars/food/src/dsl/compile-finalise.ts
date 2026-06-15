/**
 * Failure-path helpers. Each `failX` writes `compile_status='failed'` plus a
 * structured `compile_error` JSON onto `recipe_versions`, clears any prior
 * `recipe_lines` / `recipe_steps`, and returns a typed `CompileResult` the
 * caller surfaces verbatim.
 */
import { eq } from 'drizzle-orm';

import {
  recipeLines,
  recipeSteps,
  recipeVersionProposedSlugs,
  recipeVersions,
} from '../db/schema.js';

import type { FoodDb } from '../db/services/internal.js';
import type { RecipeAst, RecipeHeader } from './ast.js';
import type {
  CompileError,
  CompileErrorJson,
  CompilePhase,
  CompileResult,
} from './compile-types.js';
import type { ResolveResult, ResolvedRecipeAst } from './resolver-types.js';

export function persistProposedSlugs(
  tx: FoodDb,
  versionId: number,
  resolveResult: ResolveResult
): void {
  tx.delete(recipeVersionProposedSlugs)
    .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
    .run();
  for (const proposed of resolveResult.proposedSlugs) {
    tx.insert(recipeVersionProposedSlugs)
      .values({
        recipeVersionId: versionId,
        slug: proposed.slug,
        suggestedKind: proposed.suggestedKind ?? null,
        fromLocJson: JSON.stringify(proposed.fromLoc),
      })
      .run();
  }
}

export function failParse(
  tx: FoodDb,
  versionId: number,
  errors: readonly CompileError[]
): CompileResult {
  // Parse failure: the version is unusable; clear any stale review-queue
  // entries from a prior compile so they don't outlive the version they
  // were proposed against.
  tx.delete(recipeVersionProposedSlugs)
    .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
    .run();
  return failCompile({ tx, versionId, phase: 'parse', errors, proposedSlugsCount: 0 });
}

export function failResolve(
  tx: FoodDb,
  versionId: number,
  errors: readonly CompileError[],
  proposedSlugsCount: number
): CompileResult {
  return failCompile({ tx, versionId, phase: 'resolve', errors, proposedSlugsCount });
}

export interface CycleFailureArgs {
  tx: FoodDb;
  versionId: number;
  path: readonly number[];
  pathSlugs: readonly string[];
  ast: RecipeAst;
}

export function failCycle(args: CycleFailureArgs): CompileResult {
  const cycleError: CompileError = {
    code: 'RecipeCycle',
    message: `Cycle detected: ${args.pathSlugs.join(' -> ')}`,
    loc: firstIngredientLoc(args.ast),
  };
  return failCompile({
    tx: args.tx,
    versionId: args.versionId,
    phase: 'cycle',
    errors: [cycleError],
    proposedSlugsCount: 0,
    extra: { path: args.path, pathSlugs: args.pathSlugs },
  });
}

interface CompileFailureArgs {
  tx: FoodDb;
  versionId: number;
  phase: CompilePhase;
  errors: readonly CompileError[];
  proposedSlugsCount: number;
  extra?: Record<string, unknown>;
}

function failCompile(args: CompileFailureArgs): CompileResult {
  const { tx, versionId, phase, errors, proposedSlugsCount, extra } = args;
  tx.delete(recipeLines).where(eq(recipeLines.recipeVersionId, versionId)).run();
  tx.delete(recipeSteps).where(eq(recipeSteps.recipeVersionId, versionId)).run();
  const errorJson: CompileErrorJson & { extra?: Record<string, unknown> } = {
    phase,
    errors,
    proposedSlugsCount,
    ...(extra !== undefined ? { extra } : {}),
  };
  tx.update(recipeVersions)
    .set({
      compileStatus: 'failed',
      compileError: JSON.stringify(errorJson),
      compiledAt: new Date().toISOString(),
    })
    .where(eq(recipeVersions.id, versionId))
    .run();
  return { ok: false, phase, errors };
}

export function updateHeader(tx: FoodDb, versionId: number, resolved: ResolvedRecipeAst): void {
  const header: Partial<RecipeHeader> = resolved.header;
  tx.update(recipeVersions)
    .set({
      title: header.title ?? 'Untitled',
      summary: header.summary ?? null,
      servings: header.servings ?? null,
      prepMinutes: header.prepTime !== undefined ? minutesFromQty(header.prepTime) : null,
      cookMinutes: header.cookTime !== undefined ? minutesFromQty(header.cookTime) : null,
      yieldIngredientId: resolved.yield.yieldIngredientId,
      yieldVariantId: resolved.yield.yieldVariantId,
      yieldPrepStateId: resolved.yield.yieldPrepStateId,
      yieldQty: resolved.yield.yieldQty,
      yieldUnit: resolved.yield.yieldUnit,
      compileStatus: 'compiled',
      compileError: null,
      compiledAt: new Date().toISOString(),
    })
    .where(eq(recipeVersions.id, versionId))
    .run();
}

function minutesFromQty(qty: { qty: number; unit: string }): number {
  switch (qty.unit) {
    case 'min':
      return qty.qty;
    case 'h':
    case 'hr':
    case 'hour':
      return qty.qty * 60;
    case 's':
    case 'sec':
      return Math.round(qty.qty / 60);
    default:
      return qty.qty;
  }
}

function firstIngredientLoc(ast: RecipeAst): {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
} {
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient' && block.loc !== undefined) return block.loc;
  }
  return { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
}
