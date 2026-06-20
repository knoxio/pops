/**
 * Last-resort writer for errors that escaped the compile transaction
 * (e.g. an unanticipated SQLite CHECK / FK violation that the
 * parse/resolve/cycle phases didn't catch). Runs a fresh transaction to
 * persist `compile_status='failed'` so callers see the same DB shape
 * they'd see for an explicit phase failure. If even this fails (DB
 * closed, version row deleted) we swallow and surface the original
 * error in the returned CompileResult — don't mask root cause.
 */
import { eq } from 'drizzle-orm';

import { recipeLines, recipeSteps, recipeVersions } from '../db/schema.js';

import type { FoodDb } from '../db/services/internal.js';
import type { CompileError, CompileResult } from './compile-types.js';

export function failMaterialise(db: FoodDb, versionId: number, caught: unknown): CompileResult {
  const message = caught instanceof Error ? caught.message : String(caught);
  const errors: readonly CompileError[] = [
    {
      code: 'MaterialiseError',
      message,
      cause: caught instanceof Error ? caught.stack : undefined,
    },
  ];
  try {
    db.transaction((tx) => {
      tx.delete(recipeLines).where(eq(recipeLines.recipeVersionId, versionId)).run();
      tx.delete(recipeSteps).where(eq(recipeSteps.recipeVersionId, versionId)).run();
      tx.update(recipeVersions)
        .set({
          compileStatus: 'failed',
          compileError: JSON.stringify({ phase: 'materialise', errors, proposedSlugsCount: 0 }),
          compiledAt: new Date().toISOString(),
        })
        .where(eq(recipeVersions.id, versionId))
        .run();
    });
  } catch {
    // Persistence of the failure state itself failed — surface the
    // original error to the caller anyway.
  }
  return { ok: false, phase: 'materialise', errors };
}
