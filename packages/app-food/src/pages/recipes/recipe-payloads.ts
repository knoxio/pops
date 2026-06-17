/**
 * Narrowing helpers for the recipe SDK endpoints whose OpenAPI schema
 * degrades to `unknown`.
 *
 * `recipes.getForRendering` returns the full compiled render payload and
 * `recipes.{create,saveDraft}` return a `CompileResult`, but the generated
 * Hey API types model both as `unknown` (the recursive renderer/compile
 * shapes don't survive codegen). These guards re-attach the domain types
 * via type predicates on the discriminating fields, so call sites stay
 * type-safe without an `as` cast.
 */
import type { CompileResult, RecipeVersionWithCompiledData } from '@pops/app-food-db';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRenderingPayload(value: unknown): value is RecipeVersionWithCompiledData {
  return isRecord(value) && isRecord(value.recipe) && isRecord(value.version);
}

function isCompileResult(value: unknown): value is CompileResult {
  return isRecord(value) && typeof value.ok === 'boolean';
}

/** Narrow a `getForRendering` payload to the renderer's domain type. */
export function asRenderingPayload(value: unknown): RecipeVersionWithCompiledData {
  if (isRenderingPayload(value)) return value;
  throw new Error('food API returned a malformed recipe-rendering payload');
}

/** Narrow a compile result (from create/saveDraft) to `CompileResult`. */
export function asCompileResult(value: unknown): CompileResult {
  if (isCompileResult(value)) return value;
  throw new Error('food API returned a malformed compile result');
}
