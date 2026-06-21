/**
 * Node-only hero-image path helpers. Split from `./hero-paths.ts` because
 * the browser-bound `HeroImageUploader` imports constants from that file
 * and Vite cannot resolve `node:path` or read `process.env`.
 *
 * The same layout is mirrored at `apps/pops-api/src/modules/food/
 * hero-image/paths.ts` — pops-api doesn't depend on `@pops/app-food` at
 * runtime, so keep both sources in sync.
 */
import { resolve, sep } from 'node:path';

import {
  DEFAULT_FOOD_RECIPES_DIR,
  assertValidRecipeId,
  isValidHeroFilename,
  type HeroOriginalExtension,
} from './hero-paths';

export { DEFAULT_FOOD_RECIPES_DIR, assertValidRecipeId, isValidHeroFilename };

/**
 * Resolve the configured recipes root to an absolute path. Reads the env
 * each call so tests can stub it per-case.
 */
export function recipesRootDir(): string {
  const configured = process.env['FOOD_RECIPES_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_RECIPES_DIR;
  return resolve(raw);
}

/** Absolute path to a recipe's hero directory. */
export function recipeDirFor(recipeId: number): string {
  const id = assertValidRecipeId(recipeId);
  return resolve(recipesRootDir(), String(id));
}

/** Absolute path to the original hero file with the given extension. */
export function heroPathFor(recipeId: number, ext: HeroOriginalExtension): string {
  return resolve(recipeDirFor(recipeId), `hero.${ext}`);
}

/** Absolute path to the 320px thumbnail. */
export function thumbPathFor(recipeId: number): string {
  return resolve(recipeDirFor(recipeId), 'hero-thumb.webp');
}

/** Absolute path to the 640px card-size thumbnail. */
export function cardPathFor(recipeId: number): string {
  return resolve(recipeDirFor(recipeId), 'hero-card.webp');
}

/**
 * Defence-in-depth path-traversal guard for the Express static route.
 * Returns the absolute path iff it lives under the configured root.
 */
export function resolveServablePath(recipeId: number, filename: string): string | null {
  if (!isValidHeroFilename(filename)) return null;
  const id = assertValidRecipeId(recipeId);
  const root = recipesRootDir();
  const absPath = resolve(root, String(id), filename);
  if (absPath !== root && !absPath.startsWith(root + sep)) return null;
  return absPath;
}
