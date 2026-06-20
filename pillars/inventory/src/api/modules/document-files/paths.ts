/**
 * Shared filesystem path helpers for inventory direct-upload documents.
 *
 * Used by both the upload service (writes files) and the static file route
 * (reads files), so the env var resolution and default fallback live in one
 * place to avoid drift.
 *
 * Mirrors the photos module's `paths.ts` but reads `INVENTORY_DOCUMENTS_DIR`
 * so document blobs can live on a separate disk/volume from photos if desired.
 */
import { resolve } from 'node:path';

const DEFAULT_INVENTORY_DOCUMENTS_DIR = './data/inventory/documents';

/**
 * Resolve the absolute base directory for inventory item document uploads.
 *
 * Reads `INVENTORY_DOCUMENTS_DIR` from the environment, falling back to
 * `./data/inventory/documents` (relative to the API process cwd).
 */
export function getInventoryDocumentsDir(): string {
  const dir = process.env.INVENTORY_DOCUMENTS_DIR ?? DEFAULT_INVENTORY_DOCUMENTS_DIR;
  return resolve(dir);
}
