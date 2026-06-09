/**
 * Filesystem + URL helpers for recipe hero images (PRD-124).
 *
 * The hero root is configured via `FOOD_RECIPES_DIR` and defaults to
 * `./data/food/recipes`. Each recipe owns a subdirectory keyed by its
 * integer id holding the original upload plus two derived thumbnails:
 *
 *   ${FOOD_RECIPES_DIR}/<recipe_id>/
 *     hero.<ext>          original upload (jpg|png|webp)
 *     hero-thumb.webp     320px wide
 *     hero-card.webp      640px wide
 *
 * `recipes.hero_image_path` stores the relative path of the original
 * (`<recipe_id>/hero.<ext>`); thumbnail paths are derived at read time.
 *
 * Server-side consumers compute the absolute path on disk via the
 * `*AbsPathFor` helpers below. Browser-side consumers compute the URL via
 * `heroImageUrl(currentPath, variant)`.
 *
 * The same convention is mirrored inside `apps/pops-api/src/modules/food/
 * hero-image/service.ts` — pops-api does not depend on `@pops/app-food` at
 * runtime, so the absolute-path helpers are duplicated there. Keep the two
 * sources in sync if the layout ever changes.
 */
import { posix, resolve, sep } from 'node:path';

/** Hard-coded default — kept in sync with `apps/pops-api/.env.example`. */
export const DEFAULT_FOOD_RECIPES_DIR = './data/food/recipes';

/** File extensions allowed for the original hero upload. */
export const HERO_ORIGINAL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type HeroOriginalExtension = (typeof HERO_ORIGINAL_EXTENSIONS)[number];

/** Map a supported mime type to the on-disk extension. */
export const HERO_MIME_TO_EXTENSION: Readonly<Record<string, HeroOriginalExtension>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Mime types accepted by the upload endpoint. */
export const HERO_ALLOWED_MIME_TYPES = Object.keys(HERO_MIME_TO_EXTENSION);

/** Variant the renderer asks for when constructing an image URL. */
export type HeroImageVariant = 'original' | 'thumb' | 'card';

/**
 * Resolve the configured recipes root to an absolute path. Reads the env
 * each call so tests can stub it per-case.
 */
export function recipesRootDir(): string {
  const configured = process.env['FOOD_RECIPES_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_RECIPES_DIR;
  return resolve(raw);
}

/**
 * Reject any non-positive integer recipe id. Accepts both numeric and
 * decimal-string forms so Express path params can be passed through. Returns
 * the coerced number for callers that need the integer form.
 */
export function assertValidRecipeId(recipeId: unknown): number {
  if (typeof recipeId === 'number') {
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      throw new Error(`Invalid recipe id: ${recipeId}`);
    }
    return recipeId;
  }
  if (typeof recipeId === 'string') {
    if (!/^\d+$/.test(recipeId)) {
      throw new Error(`Invalid recipe id: ${recipeId}`);
    }
    const parsed = Number.parseInt(recipeId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid recipe id: ${recipeId}`);
    }
    return parsed;
  }
  throw new Error(`Invalid recipe id: ${String(recipeId)}`);
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
 * Compose the value stored in `recipes.hero_image_path`. Uses POSIX
 * separators so the string is portable across Linux/macOS/Windows.
 */
export function relativeHeroPath(recipeId: number, ext: HeroOriginalExtension): string {
  const id = assertValidRecipeId(recipeId);
  return posix.join(String(id), `hero.${ext}`);
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

/**
 * Build the URL the renderer should hit for a recipe's hero image.
 *
 * `currentPath` is the value of `recipes.hero_image_path` — a relative
 * `<recipeId>/hero.<ext>` string. Returns `null` if the path is missing or
 * malformed so callers can render a placeholder.
 *
 * - `original`: serves the source file (preserves the uploaded extension).
 * - `thumb`: 320px webp. Renderers should use this for `variant='compact'`.
 * - `card`: 640px webp. List-view cards.
 *
 * The route is `/api/food/recipes/<recipeId>/<filename>`.
 */
export function heroImageUrl(
  currentPath: string | null | undefined,
  variant: HeroImageVariant = 'original'
): string | null {
  if (!currentPath) return null;
  // Split on POSIX separator — the column is always written with `/`.
  const match = /^(\d+)\/hero\.(jpg|jpeg|png|webp)$/.exec(currentPath);
  if (!match) return null;
  const recipeId = match[1] ?? '';
  const ext = match[2] ?? '';
  const filename = filenameForVariant(variant, ext);
  return `/api/food/recipes/${recipeId}/${filename}`;
}

function filenameForVariant(variant: HeroImageVariant, ext: string): string {
  if (variant === 'thumb') return 'hero-thumb.webp';
  if (variant === 'card') return 'hero-card.webp';
  return `hero.${ext}`;
}
