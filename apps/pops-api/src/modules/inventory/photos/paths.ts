/**
 * Shared filesystem path helpers for inventory photos.
 *
 * Used by both the upload service (writes files) and the static file route
 * (reads files), so the env var resolution and default fallback are kept in
 * one place to avoid drift.
 */
import { resolve } from 'node:path';

const DEFAULT_INVENTORY_IMAGES_DIR = './data/inventory/images';

/**
 * Resolve the absolute base directory for inventory item photos.
 *
 * Reads `INVENTORY_IMAGES_DIR` from the environment, falling back to
 * `./data/inventory/images` (relative to the API process cwd).
 */
export function getInventoryImagesDir(): string {
  const dir = process.env.INVENTORY_IMAGES_DIR ?? DEFAULT_INVENTORY_IMAGES_DIR;
  return resolve(dir);
}
