/**
 * Browser-safe hero-image helpers: constants + filename validators + URL
 * builder. NO `node:path`, NO `process.env`, NO filesystem — those live in
 * `./hero-paths.node.ts` so this module can be imported by browser bundles
 * (e.g. `HeroImageUploader`) without breaking Vite resolution.
 *
 * Layout convention (defined here so both the browser URL builder and the
 * Node-side absolute-path helpers agree on names):
 *
 *   ${FOOD_RECIPES_DIR}/<recipe_id>/
 *     hero.<ext>          original upload (jpg|png|webp)
 *     hero-thumb.webp     320px wide
 *     hero-card.webp      640px wide
 *
 * `recipes.hero_image_path` stores the relative path of the original
 * (`<recipe_id>/hero.<ext>`); thumbnail paths are derived at read time.
 */

/** Hard-coded default for `FOOD_RECIPES_DIR`. */
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

/**
 * Compose the value stored in `recipes.hero_image_path`. Uses POSIX
 * separators so the string is portable across Linux/macOS/Windows.
 */
export function relativeHeroPath(recipeId: number, ext: HeroOriginalExtension): string {
  const id = assertValidRecipeId(recipeId);
  return `${id}/hero.${ext}`;
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
