/**
 * Mirrors the layout in `pillars/food/app/src/storage/hero-paths.ts`. The API
 * can't import from the browser-bundled app at runtime, so the absolute-path
 * resolution is duplicated here — keep both in sync.
 */
import { resolve, sep } from 'node:path';

const DEFAULT_FOOD_RECIPES_DIR = './data/food/recipes';

export const HERO_ORIGINAL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type HeroOriginalExtension = (typeof HERO_ORIGINAL_EXTENSIONS)[number];

export const HERO_MIME_TO_EXTENSION: Readonly<Record<string, HeroOriginalExtension>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const HERO_ALLOWED_MIME_TYPES = Object.keys(HERO_MIME_TO_EXTENSION);

/** Resolve the configured root directory. Reads env each call so tests can stub. */
export function recipesRootDir(): string {
  const configured = process.env['FOOD_RECIPES_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_RECIPES_DIR;
  return resolve(raw);
}

/** Throw if `recipeId` isn't a positive integer. */
export function assertValidRecipeId(recipeId: unknown): asserts recipeId is number {
  if (typeof recipeId !== 'number' || !Number.isInteger(recipeId) || recipeId <= 0) {
    throw new Error(`Invalid recipe id: ${String(recipeId)}`);
  }
}

export function recipeDirFor(recipeId: number): string {
  assertValidRecipeId(recipeId);
  return resolve(recipesRootDir(), String(recipeId));
}

export function heroAbsPathFor(recipeId: number, ext: HeroOriginalExtension): string {
  return resolve(recipeDirFor(recipeId), `hero.${ext}`);
}

export function thumbAbsPathFor(recipeId: number): string {
  return resolve(recipeDirFor(recipeId), 'hero-thumb.webp');
}

export function cardAbsPathFor(recipeId: number): string {
  return resolve(recipeDirFor(recipeId), 'hero-card.webp');
}

/** Relative path stored in `recipes.hero_image_path` (POSIX separators). */
export function relativeHeroPath(recipeId: number, ext: HeroOriginalExtension): string {
  assertValidRecipeId(recipeId);
  return `${recipeId}/hero.${ext}`;
}

/**
 * True when `filename` is one of the recognised hero assets. Used by the
 * static-file route to reject anything outside the known layout.
 */
export function isValidHeroFilename(filename: string): boolean {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
  if (filename === 'hero-thumb.webp' || filename === 'hero-card.webp') return true;
  return /^hero\.(jpg|jpeg|png|webp)$/.test(filename);
}

/**
 * Defence-in-depth sandbox check for the Express static route. Returns the
 * absolute path iff it lives under the configured root and the filename is
 * one of the known hero assets.
 */
export function resolveServablePath(recipeId: number, filename: string): string | null {
  if (!isValidHeroFilename(filename)) return null;
  assertValidRecipeId(recipeId);
  const root = recipesRootDir();
  const absPath = resolve(root, String(recipeId), filename);
  if (absPath !== root && !absPath.startsWith(root + sep)) return null;
  return absPath;
}
