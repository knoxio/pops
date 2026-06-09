/**
 * Recipe-graph cycle detector. Given a candidate recipe's `ResolvedRecipeAst`
 * and the live recipe graph in `recipe_lines`, determines whether the
 * candidate participates in a cycle. Runs between resolve and materialise.
 *
 * Algorithm: iterative DFS from each candidate target T. The explicit stack +
 * parent map avoids both recursion (no overflow on pathological graphs) and a
 * costly post-walk path reconstruction. The `recipe_lines` read is one
 * prepared SELECT per visited node; `pathSlugs` is one batched SELECT
 * against `recipes`.
 */
import { sql } from 'drizzle-orm';

import type { CycleContext, CycleDescription, CycleResult } from './cycle-types.js';
import type { ResolvedIngredientBlock, ResolvedRecipeAst } from './resolver-types.js';

interface CandidateTarget {
  recipeId: number;
  loc: ResolvedIngredientBlock['loc'];
}

export function detectRecipeCycle(resolved: ResolvedRecipeAst, ctx: CycleContext): CycleResult {
  if (ctx.currentRecipeId === null) return { ok: true };
  const targets = collectTargets(resolved);
  if (targets.length === 0) return { ok: true };
  for (const target of targets) {
    const cycle = walk(target, ctx);
    if (cycle !== null) return { ok: false, cycle };
  }
  return { ok: true };
}

function collectTargets(resolved: ResolvedRecipeAst): readonly CandidateTarget[] {
  const out: CandidateTarget[] = [];
  for (const block of resolved.blocks) {
    if (block.kind !== 'ingredient' || !block.isRecipeRef) continue;
    if (block.recipeRef === null) continue;
    out.push({ recipeId: block.recipeRef, loc: block.loc });
  }
  return out;
}

/** Run a DFS from the given target. Returns the cycle if found, else null. */
function walk(target: CandidateTarget, ctx: CycleContext): CycleDescription | null {
  const currentId = ctx.currentRecipeId;
  if (currentId === null) return null;
  // Defensive self-loop: candidate references itself directly. The resolver's
  // SelfReferenceRecipe normally catches this earlier — safety net for
  // callers that bypass the resolver.
  if (target.recipeId === currentId) {
    return buildDescription([currentId, currentId], target.loc, ctx);
  }
  const parent = new Map<number, number | null>();
  parent.set(target.recipeId, null);
  const stack: number[] = [target.recipeId];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node === currentId) {
      const path = reconstructPath(node, parent, currentId);
      return buildDescription(path, target.loc, ctx);
    }
    for (const next of outgoingEdges(node, ctx)) {
      if (parent.has(next)) continue;
      parent.set(next, node);
      stack.push(next);
    }
  }
  return null;
}

function outgoingEdges(recipeId: number, ctx: CycleContext): readonly number[] {
  const result = ctx.db.all<{ recipe_ref_id: number | null }>(sql`
    SELECT rl.recipe_ref_id AS recipe_ref_id
      FROM recipe_lines rl
      JOIN recipes r ON rl.recipe_version_id = r.current_version_id
     WHERE r.id = ${recipeId}
       AND rl.is_recipe_ref = 1
       AND rl.recipe_ref_id IS NOT NULL
  `);
  const out: number[] = [];
  for (const row of result) {
    if (row.recipe_ref_id !== null) out.push(row.recipe_ref_id);
  }
  return out;
}

/**
 * Walk parents from the cycle-closing node back to the target, prepend the
 * candidate, append the cycle-closing node. Result is in walk order from
 * candidate → target → ... → candidate.
 */
function reconstructPath(
  closingNode: number,
  parent: Map<number, number | null>,
  currentId: number
): number[] {
  // closingNode === currentId by the caller's contract.
  // Walk parents from currentId back to the root (target).
  const reverse: number[] = [];
  let cursor: number | null = closingNode;
  // Skip the closingNode==currentId on the first iteration — we'll append it.
  const parentOfClosing = parent.get(closingNode);
  cursor = parentOfClosing ?? null;
  while (cursor !== null) {
    reverse.push(cursor);
    const next = parent.get(cursor);
    cursor = next === undefined ? null : next;
  }
  reverse.reverse();
  return [currentId, ...reverse, currentId];
}

function buildDescription(
  path: readonly number[],
  loc: ResolvedIngredientBlock['loc'],
  ctx: CycleContext
): CycleDescription {
  const slugs = batchedSlugs(path, ctx);
  return { path: [...path], pathSlugs: slugs, offendingBlockLoc: loc };
}

function batchedSlugs(path: readonly number[], ctx: CycleContext): string[] {
  const unique = Array.from(new Set(path));
  if (unique.length === 0) return [];
  const idList = sql.join(
    unique.map((id) => sql`${id}`),
    sql.raw(',')
  );
  const rows = ctx.db.all<{ id: number; slug: string }>(
    sql`SELECT id, slug FROM recipes WHERE id IN (${idList})`
  );
  const lookup = new Map<number, string>();
  for (const row of rows) lookup.set(row.id, row.slug);
  return path.map((id) => lookup.get(id) ?? String(id));
}
