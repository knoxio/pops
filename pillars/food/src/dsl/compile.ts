/**
 * Recipe compile pipeline. Takes a `recipe_versions.id`, runs
 * parse → resolve → cycle → materialise in one Drizzle transaction, and
 * writes `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs`
 * rows alongside an update to `recipe_versions`.
 */
import { eq } from 'drizzle-orm';

import { recipeLines, recipeSteps, recipeVersions } from '../db/schema.js';
import { applyCreations } from './compile-creations.js';
import {
  failCycle,
  failParse,
  failResolve,
  persistProposedSlugs,
  updateHeader,
} from './compile-finalise.js';
import {
  buildIngredientDefaultUnitLookup,
  buildIngredientSlugLookup,
  buildLineLabels,
  serialiseSourceDescriptor,
} from './compile-helpers.js';
import { buildLineInsert } from './compile-lines.js';
import { failMaterialise } from './compile-materialise-fail.js';
import { buildStepInsert } from './compile-steps.js';
import { detectRecipeCycle } from './cycle.js';
import { parseRecipeDsl } from './parser.js';
import { resolveRecipeAst } from './resolver.js';

import type { FoodDb } from '../db/services/internal.js';
import type { IngredientBlock, RecipeAst } from './ast.js';
import type { RenderContext } from './compile-md.js';
import type { CompileResult } from './compile-types.js';
import type { ResolvedRecipeAst } from './resolver-types.js';

export function compileRecipeVersion(versionId: number, db: FoodDb): CompileResult {
  try {
    return db.transaction((tx): CompileResult => compileInTx(tx, versionId));
  } catch (caught) {
    return failMaterialise(db, versionId, caught);
  }
}

function compileInTx(tx: FoodDb, versionId: number): CompileResult {
  const versionRow = loadVersion(tx, versionId);
  const parseResult = parseRecipeDsl(versionRow.bodyDsl);
  if (!parseResult.ok) {
    return failParse(tx, versionId, parseResult.errors);
  }
  return compileResolved(tx, versionId, versionRow.recipeId, parseResult.ast);
}

interface LoadedVersion {
  bodyDsl: string;
  recipeId: number;
}

function loadVersion(tx: FoodDb, versionId: number): LoadedVersion {
  const rows = tx
    .select({ bodyDsl: recipeVersions.bodyDsl, recipeId: recipeVersions.recipeId })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all();
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`compileRecipeVersion: recipe_version #${versionId} not found`);
  }
  return row;
}

function compileResolved(
  tx: FoodDb,
  versionId: number,
  recipeId: number,
  ast: RecipeAst
): CompileResult {
  const resolveCtx = { db: tx, currentRecipeId: recipeId };
  let resolveResult = resolveRecipeAst(ast, resolveCtx);
  let creationCount = 0;
  if (resolveResult.creations.length > 0) {
    creationCount = applyCreations(tx, resolveResult.creations);
    resolveResult = resolveRecipeAst(ast, resolveCtx);
  }
  persistProposedSlugs(tx, versionId, resolveResult);
  if (!resolveResult.ok) {
    return failResolve(tx, versionId, resolveResult.errors, resolveResult.proposedSlugs.length);
  }
  const cycleResult = detectRecipeCycle(resolveResult.resolved, {
    db: tx,
    currentRecipeId: recipeId,
  });
  if (!cycleResult.ok) {
    return failCycle({
      tx,
      versionId,
      path: cycleResult.cycle.path,
      pathSlugs: cycleResult.cycle.pathSlugs,
      ast,
    });
  }
  return materialise({ tx, versionId, ast, resolved: resolveResult.resolved, creationCount });
}

interface MaterialiseArgs {
  tx: FoodDb;
  versionId: number;
  ast: RecipeAst;
  resolved: ResolvedRecipeAst;
  creationCount: number;
}

function materialise(args: MaterialiseArgs): CompileResult {
  const { tx, versionId, ast, resolved, creationCount } = args;
  tx.delete(recipeLines).where(eq(recipeLines.recipeVersionId, versionId)).run();
  tx.delete(recipeSteps).where(eq(recipeSteps.recipeVersionId, versionId)).run();

  const lineCount = insertLines(tx, versionId, ast, resolved);
  const render: RenderContext = {
    labels: buildLineLabels(ast),
    slugsByIngredientId: buildIngredientSlugLookup(tx, resolved),
  };
  const stepCount = insertSteps(tx, versionId, resolved, render);
  updateHeader(tx, versionId, resolved);
  return { ok: true, lineCount, stepCount, creationCount };
}

function insertLines(
  tx: FoodDb,
  versionId: number,
  ast: RecipeAst,
  resolved: ResolvedRecipeAst
): number {
  const sourceByIndex = new Map<number, IngredientBlock>();
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') sourceByIndex.set(block.index, block);
  }
  const defaultUnitLookup = buildIngredientDefaultUnitLookup(tx, resolved);
  let inserted = 0;
  for (const block of resolved.blocks) {
    if (block.kind !== 'ingredient') continue;
    const source = sourceByIndex.get(block.index);
    if (source === undefined) {
      throw new Error(
        `compile: resolved block index=${block.index} has no source counterpart in parser AST`
      );
    }
    if (block.ingredientId === null) {
      throw new Error(
        `compile: ingredient block index=${block.index} still has null ingredientId after creations applied`
      );
    }
    const row = buildLineInsert({
      block,
      recipeVersionId: versionId,
      originalText: serialiseSourceDescriptor(source),
      ingredientDefaultUnit: defaultUnitLookup(block.ingredientId),
      db: tx,
    });
    tx.insert(recipeLines).values(row).run();
    inserted += 1;
  }
  return inserted;
}

function insertSteps(
  tx: FoodDb,
  versionId: number,
  resolved: ResolvedRecipeAst,
  render: RenderContext
): number {
  let position = 0;
  let inserted = 0;
  for (const block of resolved.blocks) {
    if (block.kind !== 'step') continue;
    position += 1;
    const row = buildStepInsert({
      block,
      position,
      recipeVersionId: versionId,
      render,
    });
    tx.insert(recipeSteps).values(row).run();
    inserted += 1;
  }
  return inserted;
}
