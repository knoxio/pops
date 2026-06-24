/**
 * On-disk + DB lifecycle for `recipes.hero_image_path`:
 *   - validates the upload (mime type, size, decodable image header)
 *   - writes the original atomically (`.tmp` + rename)
 *   - generates two derived thumbnails with sharp (320px webp, 640px webp)
 *   - updates `recipes.hero_image_path` and removes any stale prior original
 *
 * sharp lives in the pillar API (the browser-bundled app can't carry it),
 * so the heavy work is done here.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';

import { type FoodDb, recipes } from '../../../db/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import {
  cardAbsPathFor,
  heroAbsPathFor,
  HERO_ALLOWED_MIME_TYPES,
  HERO_MIME_TO_EXTENSION,
  type HeroOriginalExtension,
  recipeDirFor,
  relativeHeroPath,
  thumbAbsPathFor,
} from './paths.js';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface UploadHeroInput {
  recipeId: number;
  mimeType: string;
  /** Raw decoded image bytes. The REST handler decodes the base64 wire field. */
  buffer: Buffer;
}

export interface UploadHeroResult {
  heroImagePath: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/**
 * Read the configured upload size cap. Reads env each call so tests can
 * stub. Invalid or non-positive values fall back to the default.
 */
function maxBytes(): number {
  const raw = process.env['FOOD_HERO_MAX_BYTES'];
  if (raw === undefined || raw.length === 0) return DEFAULT_MAX_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BYTES;
  return parsed;
}

function extensionFor(mimeType: string): HeroOriginalExtension {
  const ext = HERO_MIME_TO_EXTENSION[mimeType];
  if (ext === undefined) {
    throw new ValidationError(
      `Unsupported mime type "${mimeType}". Allowed: ${HERO_ALLOWED_MIME_TYPES.join(', ')}`
    );
  }
  return ext;
}

function assertRecipeIdInteger(recipeId: number): void {
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    throw new ValidationError(`Invalid recipe id: ${recipeId}`);
  }
}

function assertRecipeExists(db: FoodDb, recipeId: number): void {
  const [row] = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId)).all();
  if (!row) throw new NotFoundError('Recipe', String(recipeId));
}

/**
 * Write `bytes` to `target` atomically by writing to `${target}.tmp` then
 * renaming. Rename is a single FS operation on POSIX, so readers either
 * see the old file or the new one — never a half-written partial.
 */
function writeAtomic(target: string, bytes: Buffer): void {
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, target);
}

/**
 * Remove any `hero.*` originals in the directory that don't match the
 * extension we just wrote. Replacement with a different mime type would
 * otherwise leave the old file behind.
 */
function removeStaleOriginals(dir: string, keepExt: HeroOriginalExtension): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (!/^hero\.(jpg|jpeg|png|webp)$/.test(entry)) continue;
    if (entry === `hero.${keepExt}`) continue;
    try {
      unlinkSync(join(dir, entry));
    } catch {
      // Best-effort cleanup; missing or locked files surface through the
      // renderer fallback rather than the upload path.
    }
  }
}

interface ThumbnailWriteResult {
  /** True if both thumbnails were produced; false logs a warning upstream. */
  ok: boolean;
}

async function writeThumbnails(
  originalBytes: Buffer,
  thumbTarget: string,
  cardTarget: string
): Promise<ThumbnailWriteResult> {
  // Sharp's default is "strip everything" on output unless `.withMetadata()`
  // is called — EXIF is dropped from both webp variants. `.rotate()` applies
  // the original EXIF orientation BEFORE the strip.
  try {
    const [thumb, card] = await Promise.all([
      sharp(originalBytes).rotate().resize({ width: 320 }).webp({ quality: 80 }).toBuffer(),
      sharp(originalBytes).rotate().resize({ width: 640 }).webp({ quality: 85 }).toBuffer(),
    ]);
    writeAtomic(thumbTarget, thumb);
    writeAtomic(cardTarget, card);
    return { ok: true };
  } catch (err) {
    console.warn('[food/hero] thumbnail generation failed; keeping original only', err);
    bestEffortUnlink([thumbTarget, cardTarget, `${thumbTarget}.tmp`, `${cardTarget}.tmp`]);
    return { ok: false };
  }
}

function bestEffortUnlink(paths: readonly string[]): void {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

async function probeDimensions(bytes: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  if (typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    throw new ValidationError('Image dimensions could not be determined.');
  }
  return { width: meta.width, height: meta.height };
}

/**
 * Upload a hero image for `input.recipeId`. Writes the original + two
 * thumbnails and updates `recipes.hero_image_path`. Atomic per file —
 * concurrent uploads to the same recipe are last-wins on the DB column.
 */
export async function uploadHeroImage(
  db: FoodDb,
  input: UploadHeroInput
): Promise<UploadHeroResult> {
  assertRecipeIdInteger(input.recipeId);
  const recipeId = input.recipeId;
  if (input.buffer.length === 0) {
    throw new ValidationError('Image upload is empty.');
  }
  if (input.buffer.length > maxBytes()) {
    throw new ValidationError(`Image exceeds the maximum allowed size of ${maxBytes()} bytes.`);
  }
  const ext = extensionFor(input.mimeType);

  let dimensions: { width: number; height: number };
  try {
    dimensions = await probeDimensions(input.buffer);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(
      `Image could not be decoded (${err instanceof Error ? err.message : 'unknown error'})`
    );
  }

  assertRecipeExists(db, recipeId);

  const dir = recipeDirFor(recipeId);
  mkdirSync(dir, { recursive: true });

  const originalTarget = heroAbsPathFor(recipeId, ext);
  writeAtomic(originalTarget, input.buffer);
  removeStaleOriginals(dir, ext);

  await writeThumbnails(input.buffer, thumbAbsPathFor(recipeId), cardAbsPathFor(recipeId));

  const relPath = relativeHeroPath(recipeId, ext);
  db.update(recipes).set({ heroImagePath: relPath }).where(eq(recipes.id, recipeId)).run();

  return {
    heroImagePath: relPath,
    sizeBytes: input.buffer.length,
    width: dimensions.width,
    height: dimensions.height,
  };
}

/**
 * Remove a recipe's hero image and clear `recipes.hero_image_path`.
 * Missing files are tolerated — the goal is "no hero after this returns",
 * not strict file accounting.
 */
export function removeHeroImage(db: FoodDb, recipeIdInput: number): void {
  assertRecipeIdInteger(recipeIdInput);
  const recipeId = recipeIdInput;
  assertRecipeExists(db, recipeId);

  const dir = recipeDirFor(recipeId);
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      if (!/^hero(\.|-)/.test(entry)) continue;
      try {
        rmSync(resolve(dir, entry), { force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  db.update(recipes).set({ heroImagePath: null }).where(eq(recipes.id, recipeId)).run();
}
