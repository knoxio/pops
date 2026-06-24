/**
 * Raw (non-ts-rest) byte-serving routes for the inventory pillar:
 * - `GET /api/inventory/photos/items/:itemId/:filename` — uploaded item photos
 * - `GET /api/inventory/documents/items/:itemId/:filename` — direct-upload docs
 * - `GET /inventory/documents/:id/thumbnail` — Paperless-ngx thumbnail proxy
 *
 * GET-only and validated by filename pattern, so they need no DB handle. They
 * are deliberately NOT ts-rest contract routes (mirrors media's `/media/images`)
 * so they add no OpenAPI surface.
 */
import { resolve } from 'node:path';

import { type Request, type Response, type Router as ExpressRouter, Router } from 'express';

import { getInventoryDocumentsDir } from '../modules/document-files/paths.js';
import { getPaperlessClient } from '../modules/paperless/index.js';
import { PaperlessApiError } from '../modules/paperless/types.js';
import { getInventoryImagesDir } from '../modules/photos/paths.js';
import { tryServeFile } from './serve-file.js';

/** Uploaded item bytes can change on re-upload, so cache privately + short. */
const UPLOAD_CACHE_CONTROL = 'private, max-age=3600';
const THUMBNAIL_CACHE_CONTROL = 'public, max-age=3600';

/** Item IDs are hex blobs in prod; e2e seeds use simple `inv-NNN` ids. */
const ITEM_ID_RE = /^[a-z0-9-]+$/i;
/** Photo filenames: `photo_NNN.jpg` (written by the photos service). */
const PHOTO_FILENAME_RE = /^photo_\d+\.jpg$/;
/** Direct-upload doc filenames: `file_NNN.{ext}` (PDFs, images, text). */
const DOC_FILENAME_RE = /^file_\d+\.[a-z0-9]+$/i;

interface ServeSpec {
  /** Resolved at request time so tests can flip the env per case. */
  baseDir: string;
  filenameRe: RegExp;
  notFound: string;
}

async function serveItemFile(req: Request, res: Response, spec: ServeSpec): Promise<void> {
  const itemId = String(req.params['itemId'] ?? '');
  const filename = String(req.params['filename'] ?? '');

  if (!itemId || itemId.includes('..') || itemId.includes('/') || !ITEM_ID_RE.test(itemId)) {
    res.status(400).json({ error: `Invalid item id: ${itemId}` });
    return;
  }
  if (!spec.filenameRe.test(filename)) {
    res.status(400).json({ error: `Invalid filename: ${filename}` });
    return;
  }

  const filePath = resolve(spec.baseDir, 'items', itemId, filename);
  // Sandbox: the resolved path must live inside the base dir — defends against
  // any traversal the regexes don't catch.
  if (!filePath.startsWith(spec.baseDir + '/') && filePath !== spec.baseDir) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const served = await tryServeFile(filePath, res, UPLOAD_CACHE_CONTROL);
  if (!served) res.status(404).json({ error: spec.notFound });
}

/** Build the inventory pillar's raw file-serving router. */
export function createInventoryFilesRouter(): ExpressRouter {
  const router = Router();

  router.get('/api/inventory/photos/items/:itemId/:filename', async (req, res): Promise<void> => {
    await serveItemFile(req, res, {
      baseDir: getInventoryImagesDir(),
      filenameRe: PHOTO_FILENAME_RE,
      notFound: 'Photo not found',
    });
  });

  router.get(
    '/api/inventory/documents/items/:itemId/:filename',
    async (req, res): Promise<void> => {
      await serveItemFile(req, res, {
        baseDir: getInventoryDocumentsDir(),
        filenameRe: DOC_FILENAME_RE,
        notFound: 'Document not found',
      });
    }
  );

  router.get('/inventory/documents/:id/thumbnail', async (req, res): Promise<void> => {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: `Invalid document id: ${id}` });
      return;
    }

    const client = getPaperlessClient();
    if (!client) {
      res.status(503).json({ error: 'Paperless-ngx is not configured' });
      return;
    }

    try {
      const response = await client.fetchThumbnail(Number(id));
      if (!response.ok) {
        if (response.status === 404) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }
        res.status(502).json({ error: 'Failed to fetch thumbnail from Paperless' });
        return;
      }

      const contentType = response.headers.get('content-type') ?? 'image/png';
      res.set({ 'Content-Type': contentType, 'Cache-Control': THUMBNAIL_CACHE_CONTROL });
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      if (err instanceof PaperlessApiError) {
        res.status(502).json({ error: `Paperless error: ${err.message}` });
        return;
      }
      console.error('[inventory/documents] Thumbnail proxy error:', err);
      res.status(502).json({ error: 'Failed to fetch thumbnail' });
    }
  });

  return router;
}
