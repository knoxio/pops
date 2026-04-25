/**
 * Express route for serving uploaded inventory item photos.
 *
 * GET /api/inventory/photos/items/:itemId/:filename
 *
 * Static file serving from `INVENTORY_IMAGES_DIR` (default: `./data/inventory/images`).
 * Mounted before auth middleware — these are user-uploaded image bytes that the
 * frontend pulls via plain `<img>` tags, so cookie/JWT auth would block rendering.
 *
 * Path resolution is sandboxed: the resolved file path must live inside the
 * configured base dir, and `itemId` / `filename` are validated against strict
 * patterns to reject path traversal attempts.
 */
import { resolve } from 'node:path';

import { type Router as ExpressRouter, type Request, Router } from 'express';

import { getInventoryImagesDir } from '../../modules/inventory/photos/paths.js';
import { tryServeFile } from '../media/images-helpers.js';

/** Cache for one hour — uploaded photos can change on re-upload. */
const CACHE_CONTROL = 'private, max-age=3600';

/** Item IDs in the home_inventory table are 32-char lowercase hex blobs. */
const ITEM_ID_RE = /^[a-z0-9-]+$/i;

/** Photo filenames follow the convention written by `service.ts:nextPhotoFilename`. */
const FILENAME_RE = /^photo_\d+\.jpg$/;

interface ValidationFailure {
  status: number;
  body: { error: string };
}

interface ValidatedParams {
  itemId: string;
  filename: string;
}

function validateParams(req: Request): ValidatedParams | ValidationFailure {
  const itemId = String(req.params['itemId'] ?? '');
  const filename = String(req.params['filename'] ?? '');

  if (!itemId || itemId.includes('..') || itemId.includes('/') || !ITEM_ID_RE.test(itemId)) {
    return { status: 400, body: { error: `Invalid item id: ${itemId}` } };
  }
  if (!FILENAME_RE.test(filename)) {
    return { status: 400, body: { error: `Invalid filename: ${filename}` } };
  }
  return { itemId, filename };
}

function isValidationFailure(
  value: ValidatedParams | ValidationFailure
): value is ValidationFailure {
  return 'status' in value;
}

const router: ExpressRouter = Router();

router.get('/api/inventory/photos/items/:itemId/:filename', async (req, res): Promise<void> => {
  const params = validateParams(req);
  if (isValidationFailure(params)) {
    res.status(params.status).json(params.body);
    return;
  }

  const baseDir = getInventoryImagesDir();
  const filePath = resolve(baseDir, 'items', params.itemId, params.filename);

  // Sandbox check: the resolved path must live inside the base dir.
  // Without this, a crafted itemId/filename could escape via `..` even though
  // the regexes already block obvious cases.
  if (!filePath.startsWith(baseDir + '/') && filePath !== baseDir) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const served = await tryServeFile(filePath, res, CACHE_CONTROL);
  if (served) return;

  res.status(404).json({ error: 'Photo not found' });
});

export default router;
