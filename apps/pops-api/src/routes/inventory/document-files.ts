/**
 * Express route for serving uploaded inventory item documents (direct uploads,
 * not Paperless-linked).
 *
 * GET /api/inventory/documents/items/:itemId/:filename
 *
 * Static file serving from `INVENTORY_DOCUMENTS_DIR`
 * (default: `./data/inventory/documents`). Mounted before auth middleware
 * — these are user-uploaded blobs that the frontend pulls via plain
 * `<a href>` download links, so cookie/JWT auth would block downloads.
 *
 * Path resolution is sandboxed: the resolved file path must live inside the
 * configured base dir, and `itemId` / `filename` are validated against strict
 * patterns to reject path traversal attempts.
 *
 * Mirrors `routes/inventory/photos.ts` (the #2178 fix for photo serving), but
 * with a wider allowlist of file extensions because direct uploads accept
 * PDFs, images, and plain text.
 */
import { resolve } from 'node:path';

import { type Router as ExpressRouter, type Request, Router } from 'express';

import { getInventoryDocumentsDir } from '../../modules/inventory/document-files/paths.js';
import { tryServeFile } from '../shared/serve-file.js';

/** Cache for one hour — uploaded documents can change on re-upload. */
const CACHE_CONTROL = 'private, max-age=3600';

/** Item IDs are 32-char hex blobs in prod; e2e seeds use simple `inv-NNN` ids. */
const ITEM_ID_RE = /^[a-z0-9-]+$/i;

/** Document filenames follow `file_NNN.{ext}` written by `service.ts`. */
const FILENAME_RE = /^file_\d+\.[a-z0-9]+$/i;

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

router.get('/api/inventory/documents/items/:itemId/:filename', async (req, res): Promise<void> => {
  const params = validateParams(req);
  if (isValidationFailure(params)) {
    res.status(params.status).json(params.body);
    return;
  }

  const baseDir = getInventoryDocumentsDir();
  const filePath = resolve(baseDir, 'items', params.itemId, params.filename);

  // Sandbox check: the resolved path must live inside the base dir.
  if (!filePath.startsWith(baseDir + '/') && filePath !== baseDir) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const served = await tryServeFile(filePath, res, CACHE_CONTROL);
  if (served) return;

  res.status(404).json({ error: 'Document not found' });
});

export default router;
